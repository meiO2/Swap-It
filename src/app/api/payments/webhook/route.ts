import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import {
  verifyMidtransSignature,
  getMidtransServerKeyConfigured,
} from "@/lib/midtrans";
import Order from "@/models/Order";
import Payment, { type PaymentStatus } from "@/models/Payment";
import Product from "@/models/Product";
import { awardGreenPoints, GREEN_POINT_REWARDS } from "@/lib/green-points";

type MidtransNotification = {
  order_id?: string;
  transaction_id?: string;
  transaction_status?: string;
  fraud_status?: string;
  status_code?: string;
  gross_amount?: string;
  signature_key?: string;
  payment_type?: string;
};

function mapStatus(notification: MidtransNotification): PaymentStatus {
  if (
    notification.transaction_status === "settlement" ||
    (notification.transaction_status === "capture" &&
      notification.fraud_status !== "challenge")
  ) {
    return "PAID";
  }
  if (notification.transaction_status === "expire") return "EXPIRED";
  if (
    notification.transaction_status === "cancel" ||
    notification.transaction_status === "deny"
  ) {
    return "CANCELED";
  }
  if (notification.transaction_status === "refund") return "FAILED";
  return "PENDING";
}

export async function POST(request: Request) {
  try {
    if (!getMidtransServerKeyConfigured()) {
      return NextResponse.json(
        { success: false, message: "Payment webhook is not configured." },
        { status: 503 },
      );
    }

    const notification = (await request.json()) as MidtransNotification;
    const required = [
      notification.order_id,
      notification.status_code,
      notification.gross_amount,
      notification.signature_key,
    ];
    if (required.some((value) => typeof value !== "string" || !value)) {
      return NextResponse.json(
        { success: false, message: "Invalid Midtrans notification." },
        { status: 400 },
      );
    }

    if (
      !verifyMidtransSignature({
        orderId: notification.order_id!,
        statusCode: notification.status_code!,
        grossAmount: notification.gross_amount!,
        signatureKey: notification.signature_key!,
      })
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid Midtrans signature." },
        { status: 401 },
      );
    }

    const paymentStatus = mapStatus(notification);
    const midtransOrderId = notification.order_id!;
    if (!midtransOrderId.startsWith("swapit-")) {
      return NextResponse.json(
        { success: false, message: "Unknown payment order ID." },
        { status: 400 },
      );
    }
    const orderId = midtransOrderId.slice("swapit-".length);
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return NextResponse.json(
        { success: false, message: "Invalid payment order ID." },
        { status: 400 },
      );
    }

    await connectDB();
    const payment = await Payment.findOne({ midtransOrderId });
    if (!payment) {
      return NextResponse.json(
        { success: false, message: "Payment record not found." },
        { status: 404 },
      );
    }

    const receivedAmount = Number(notification.gross_amount);
    if (
      !Number.isSafeInteger(receivedAmount) ||
      receivedAmount !== payment.grossAmount
    ) {
      return NextResponse.json(
        { success: false, message: "Payment amount mismatch." },
        { status: 400 },
      );
    }

    if (payment.status === paymentStatus) {
      return NextResponse.json({ success: true, message: "Notification already processed." });
    }
    if (payment.status === "PAID" && paymentStatus !== "PAID") {
      return NextResponse.json({ success: true, message: "Payment is already paid." });
    }

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const updated = await Payment.findOneAndUpdate(
          { _id: payment._id, status: payment.status },
          {
            $set: {
              status: paymentStatus,
              transactionId: notification.transaction_id,
              paymentType: notification.payment_type,
              paidAt: paymentStatus === "PAID" ? new Date() : undefined,
            },
          },
          { new: true, session },
        );
        if (!updated) return;

        if (paymentStatus === "PAID") {
          await Order.updateOne(
            { _id: orderId, status: "PENDING_PAYMENT" },
            { $set: { status: "PAID" } },
            { session },
          );
          const paidOrder = await Order.findById(orderId).session(session).lean();
          if (paidOrder) {
            const reward = Math.floor(paidOrder.subtotal * GREEN_POINT_REWARDS.purchaseRate);
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
        } else if (
          paymentStatus === "CANCELED" ||
          paymentStatus === "EXPIRED" ||
          paymentStatus === "FAILED"
        ) {
          await Order.updateOne(
            { _id: orderId, status: "PENDING_PAYMENT" },
            { $set: { status: paymentStatus === "EXPIRED" ? "EXPIRED" : "CANCELLED" } },
            { session },
          );
          await Product.updateMany(
            { _id: { $in: (await Order.findById(orderId).session(session))?.items.map((item) => item.productId) ?? [] }, status: "RESERVED" },
            { $set: { status: "AVAILABLE" } },
            { session },
          );
          const cancelledOrder = await Order.findById(orderId).session(session);
          if (cancelledOrder && (cancelledOrder.gpUsed ?? 0) > 0) {
            await awardGreenPoints({
              userId: cancelledOrder.buyerId.toString(),
              amount: cancelledOrder.gpUsed ?? 0,
              type: "REFUND",
              description: "Green Points returned after payment cancellation",
              referenceKey: `order:${cancelledOrder._id.toString()}:gp-refund`,
              session,
            });
          }
        }
      });
    } finally {
      await session.endSession();
    }

    return NextResponse.json({ success: true, message: "Notification processed." });
  } catch (error) {
    console.error("Midtrans webhook error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to process payment notification." },
      { status: 500 },
    );
  }
}
