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
import { awardGreenPoints, GREEN_POINT_REWARDS } from "@/lib/green-points";
import { createNotificationsForMany } from "@/lib/notifications";

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

    const notification =
      (await request.json()) as XenditSessionNotification;
    const data = notification.data;
    const paymentSessionId = data?.payment_session_id ?? data?.id;
    const paymentStatus = mapStatus(notification.event ?? "", data?.status);
    if (
      !paymentStatus ||
      data?.session_type !== "PAY" ||
      typeof data?.reference_id !== "string" ||
      typeof paymentSessionId !== "string" ||
      typeof data.amount !== "number" ||
      !Number.isSafeInteger(data.amount)
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid Xendit payment session notification." },
        { status: 400 },
      );
    }

    const prefix = "swapit-";
    if (!data.reference_id.startsWith(prefix)) {
      return NextResponse.json(
        { success: false, message: "Unknown payment reference." },
        { status: 400 },
      );
    }
    const orderId = data.reference_id.slice(prefix.length);
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return NextResponse.json(
        { success: false, message: "Invalid payment order reference." },
        { status: 400 },
      );
    }

    await connectDB();
    const payment = await Payment.findOne({
      xenditSessionId: paymentSessionId,
      xenditReferenceId: data.reference_id,
      orderId,
    });
    if (!payment) {
      return NextResponse.json(
        { success: false, message: "Payment record not found." },
        { status: 404 },
      );
    }
    if (data.amount !== payment.grossAmount) {
      return NextResponse.json(
        { success: false, message: "Payment amount mismatch." },
        { status: 400 },
      );
    }
    if (payment.status === paymentStatus || payment.status === "PAID") {
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
              transactionId: data.payment_id ?? undefined,
              xenditPaymentRequestId:
                data.latest_payment_request_id ??
                data.payment_request_id ??
                undefined,
              paidAt: paymentStatus === "PAID" ? new Date() : undefined,
            },
          },
          { new: true, session },
        );
        if (!updated) return;

        if (paymentStatus === "PAID") {
          const handoverDeadline = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
          await Order.updateOne(
            { _id: orderId, status: "PENDING_PAYMENT" },
            {
              $set: {
                status: "AWAITING_SELLER_HANDOVER",
                "items.$[].handover.status": "AWAITING_SELLER_SCHEDULE",
                "items.$[].handoverDeadline": handoverDeadline,
              },
            },
            { session },
          );
          const paidOrder = await Order.findById(orderId).session(session).lean();
          if (paidOrder) {
            await Product.updateMany(
              { _id: { $in: paidOrder.items.map((item) => item.productId) }, status: "RESERVED" },
              { $set: { status: "SOLD_PENDING_HANDOVER" } },
              { session },
            );
            const sellerIds = [
              ...new Set(paidOrder.items.map((item) => item.sellerId.toString())),
            ];
            await createNotificationsForMany({
              recipientIds: sellerIds,
              senderId: paidOrder.buyerId.toString(),
              type: "ORDER_UPDATE",
              title: "New order received",
              message:
                "A buyer has placed an order for your product. Please choose drop-off or pickup and hand it over within 3 calendar days.",
              link: "/orders",
              session,
            });
            const reward = Math.floor(
              paidOrder.subtotal * GREEN_POINT_REWARDS.purchaseRate,
            );
            if (reward > 0) {
              await awardGreenPoints({
                userId: paidOrder.buyerId.toString(),
                amount: reward,
                description: "Completed marketplace purchase reward",
                referenceKey: `purchase:${paidOrder._id.toString()}`,
                session,
              });
            }
          }
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
            await awardGreenPoints({
              userId: cancelledOrder.buyerId.toString(),
              amount: cancelledOrder.gpUsed ?? 0,
              type: "REFUND",
              description: "Green Points returned after payment expiration",
              referenceKey: `order:${cancelledOrder._id.toString()}:gp-refund`,
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
