import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import {
  getXenditCallbackTokenConfigured,
  verifyXenditCallbackToken,
} from "@/lib/xendit";
import Order from "@/models/Order";
import Payment, { type PaymentStatus } from "@/models/Payment";
import Product from "@/models/Product";
import {
  restoreReservedGreenPoints,
} from "@/lib/green-points";
import { createNotificationsForMany } from "@/lib/notifications";
import { finalizePaidOrder } from "@/lib/payment-finalization";

type XenditSessionNotification = {
  event?: string;
  data?: {
    id?: string;
    payment_session_id?: string;
    reference_id?: string;
    session_type?: string;
    amount?: number;
    status?: string;
    payment_request_id?: string | null;
    latest_payment_request_id?: string | null;
    payment_id?: string | null;
  };
};

type XenditQrNotification = {
  event?: string;
  id?: string;
  amount?: number;
  qr_code?: {
    id?: string;
    external_id?: string;
    type?: string;
  };
};

function mapStatus(event: string, status?: string): PaymentStatus | null {
  if (event === "payment_session.completed" && status === "COMPLETED") {
    return "PAID";
  }
  if (event === "payment_session.expired" && status === "EXPIRED") {
    return "EXPIRED";
  }
  return null;
}

export async function POST(request: Request) {
  try {
    if (!getXenditCallbackTokenConfigured()) {
      return NextResponse.json(
        { success: false, message: "Xendit webhook is not configured." },
        { status: 503 },
      );
    }
    if (!verifyXenditCallbackToken(request.headers.get("x-callback-token"))) {
      return NextResponse.json(
        { success: false, message: "Invalid Xendit callback token." },
        { status: 401 },
      );
    }

    const notification = (await request.json()) as
      | XenditSessionNotification
      | XenditQrNotification;
    const isQrNotification = notification.event === "qr.payment";
    const sessionNotification = isQrNotification
      ? null
      : (notification as XenditSessionNotification);
    const qrNotification = isQrNotification
      ? (notification as XenditQrNotification)
      : null;
    const data = sessionNotification?.data;
    const referenceId = isQrNotification
      ? qrNotification?.qr_code?.external_id
      : data?.reference_id;
    const providerPaymentId = isQrNotification
      ? qrNotification?.qr_code?.id
      : data?.payment_session_id ?? data?.id;
    const amount = isQrNotification ? qrNotification?.amount : data?.amount;
    const transactionId = isQrNotification ? qrNotification?.id : data?.payment_id;
    const paymentStatus = isQrNotification
      ? "PAID"
      : mapStatus(notification.event ?? "", data?.status);
    if (
      !paymentStatus ||
      (!isQrNotification && data?.session_type !== "PAY") ||
      typeof referenceId !== "string" ||
      typeof providerPaymentId !== "string" ||
      typeof amount !== "number" ||
      !Number.isSafeInteger(amount) ||
      (isQrNotification && qrNotification?.qr_code?.type !== "DYNAMIC")
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid Xendit payment notification." },
        { status: 400 },
      );
    }

    const prefix = "swapit-";
    if (!referenceId.startsWith(prefix)) {
      return NextResponse.json(
        { success: false, message: "Unknown payment reference." },
        { status: 400 },
      );
    }
    const orderId = referenceId.slice(prefix.length);
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return NextResponse.json(
        { success: false, message: "Invalid payment order reference." },
        { status: 400 },
      );
    }

    await connectDB();
    const payment = await Payment.findOne({
      ...(isQrNotification
        ? { xenditQrCodeId: providerPaymentId }
        : { xenditSessionId: providerPaymentId }),
      xenditReferenceId: referenceId,
      $or: [{ provider: "XENDIT" }, { provider: { $exists: false } }],
      orderId,
    });
    if (!payment) {
      return NextResponse.json(
        { success: false, message: "Payment record not found." },
        { status: 404 },
      );
    }
    if (amount !== payment.grossAmount) {
      return NextResponse.json(
        { success: false, message: "Payment amount mismatch." },
        { status: 400 },
      );
    }
    if (payment.status === paymentStatus || payment.status === "PAID") {
      if (isQrNotification && payment.status === "PAID" && transactionId) {
        await Payment.updateOne(
          { _id: payment._id, transactionId: { $exists: false } },
          { $set: { transactionId } },
        );
      }
      return NextResponse.json({
        success: true,
        message: "Notification already processed.",
      });
    }

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const updated = await Payment.findOneAndUpdate(
          { _id: payment._id, status: payment.status },
          {
            $set: {
              status: paymentStatus,
              transactionId: transactionId ?? undefined,
              xenditPaymentRequestId: isQrNotification
                ? undefined
                : data?.latest_payment_request_id ??
                  data?.payment_request_id ??
                  undefined,
              paidAt: paymentStatus === "PAID" ? new Date() : undefined,
            },
          },
          { new: true, session },
        );
        if (!updated) return;

        if (paymentStatus === "PAID") {
          await finalizePaidOrder(orderId, session);
        } else {
          await Order.updateOne(
            { _id: orderId, status: "PENDING_PAYMENT" },
            { $set: { status: "EXPIRED" } },
            { session },
          );
          const cancelledOrder = await Order.findById(orderId).session(session);
          if (cancelledOrder) {
            await createNotificationsForMany({
              recipientIds: [cancelledOrder.buyerId.toString()],
              type: "ORDER_UPDATE",
              title: "Payment expired",
              message: "Your payment has expired. Your order has been cancelled.",
              link: "/orders",
              session,
            });
          }
          await Product.updateMany(
            {
              _id: { $in: cancelledOrder?.items.map((item) => item.productId) ?? [] },
              status: "RESERVED",
            },
            { $set: { status: "AVAILABLE" } },
            { session },
          );
          if (cancelledOrder && (cancelledOrder.gpUsed ?? 0) > 0) {
            await restoreReservedGreenPoints({
              userId: cancelledOrder.buyerId.toString(),
              orderId: cancelledOrder._id.toString(),
              amount: cancelledOrder.gpUsed ?? 0,
              referenceKey: `order:${cancelledOrder._id.toString()}:gp-refund`,
              description: "Green Points returned after payment expiration",
              session,
            });
          }
        }
      });
    } finally {
      await session.endSession();
    }

    return NextResponse.json({
      success: true,
      message: "Notification processed.",
    });
  } catch (error) {
    console.error("Xendit webhook error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to process payment notification." },
      { status: 500 },
    );
  }
}
