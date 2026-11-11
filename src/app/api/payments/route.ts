import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { requireAuth } from "@/lib/authorization";
import { connectDB } from "@/lib/mongodb";
import {
  createXenditPaymentSession,
  getXenditPaymentSession,
} from "@/lib/xendit";
import Cart from "@/models/Cart";
import Order from "@/models/Order";
import Payment from "@/models/Payment";
import Product from "@/models/Product";
import User from "@/models/User";
import { awardGreenPoints, GREEN_POINT_REWARDS } from "@/lib/green-points";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.success) return auth.response;
    await connectDB();

    const body = await request.json();
    const orderId = body?.orderId;
    if (
      typeof orderId !== "string" ||
      !mongoose.Types.ObjectId.isValid(orderId)
    ) {
      return NextResponse.json(
        { success: false, message: "A valid orderId is required." },
        { status: 400 },
      );
    }

    const order = await Order.findOne({
      _id: orderId,
      buyerId: auth.user.id,
      status: "PENDING_PAYMENT",
    }).lean();
    if (!order) {
      return NextResponse.json(
        { success: false, message: "Pending payment order not found." },
        { status: 404 },
      );
    }
    if (order.expiresAt <= new Date()) {
      return NextResponse.json(
        { success: false, message: "This order's payment window has expired." },
        { status: 409 },
      );
    }

    const existing = await Payment.findOne({ orderId: order._id }).lean();
    if (existing?.status === "PENDING" && existing.redirectUrl) {
      return NextResponse.json({
        success: true,
        data: {
          paymentId: existing._id,
          orderId: existing.orderId,
          status: existing.status,
          redirectUrl: existing.redirectUrl,
          grossAmount: existing.grossAmount,
        },
      });
    }
    if (existing && existing.status !== "PENDING") {
      return NextResponse.json(
        { success: false, message: "This order already has a final payment status." },
        { status: 409 },
      );
    }

    const user = await User.findById(auth.user.id).select("name email").lean();
    if (!user) {
      return NextResponse.json(
        { success: false, message: "Buyer account not found." },
        { status: 404 },
      );
    }

    const referenceId = `swapit-${order._id.toString()}`;
    let paymentSession;
    try {
      const resultUrl = `${new URL(request.url).origin}/payment/result?orderId=${order._id.toString()}`;
      paymentSession = await createXenditPaymentSession({
        referenceId,
        amount: order.totalAmount,
        email: user.email,
        name: user.name,
        successReturnUrl: resultUrl,
        cancelReturnUrl: resultUrl,
      });
    } catch (error) {
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          await Order.updateOne(
            { _id: order._id, status: "PENDING_PAYMENT" },
            { $set: { status: "CANCELLED" } },
            { session },
          );
          await Product.updateMany(
            { _id: { $in: order.items.map((item) => item.productId) }, status: "RESERVED" },
            { $set: { status: "AVAILABLE" } },
            { session },
          );
          await Cart.findOneAndUpdate(
            { userId: auth.user.id },
            {
              $setOnInsert: { userId: auth.user.id },
              $addToSet: {
                items: {
                  $each: order.items.map((item) => ({
                    productId: item.productId,
                    addedAt: new Date(),
                  })),
                },
              },
            },
            { upsert: true, session },
          );
          if (order.gpUsed > 0) {
            await awardGreenPoints({
              userId: auth.user.id,
              amount: order.gpUsed,
              type: "REFUND",
              description: "Green Points returned after payment creation failed",
              referenceKey: `order:${order._id.toString()}:gp-refund`,
              session,
            });
          }
        });
      } finally {
        await session.endSession();
      }
      throw error;
    }

    const payment = await Payment.findOneAndUpdate(
      { orderId: order._id },
      {
        $set: {
          userId: order.buyerId,
          // Keep the existing unique MongoDB index populated during migration.
          midtransOrderId: referenceId,
          xenditSessionId: paymentSession.payment_session_id,
          xenditReferenceId: paymentSession.reference_id,
          grossAmount: order.totalAmount,
          status: "PENDING",
          redirectUrl: paymentSession.payment_link_url,
        },
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    );

    return NextResponse.json({
      success: true,
      data: {
        paymentId: payment._id,
        orderId: payment.orderId,
        status: payment.status,
        redirectUrl: payment.redirectUrl,
        grossAmount: payment.grossAmount,
      },
    });
  } catch (error) {
    console.error("Create payment error:", error);
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Failed to create payment.",
      },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.success) return auth.response;
    await connectDB();
    const orderId = new URL(request.url).searchParams.get("orderId");
    const query: { userId: string; orderId?: string } = {
      userId: auth.user.id,
    };
    if (orderId) {
      if (!mongoose.Types.ObjectId.isValid(orderId)) {
        return NextResponse.json(
          { success: false, message: "Invalid orderId." },
          { status: 400 },
        );
      }
      query.orderId = orderId;
    }
    let payments = await Payment.find(query)
      .sort({ createdAt: -1 })
      .lean();

    const pending = payments.find(
      (payment) => payment.status === "PENDING" && payment.xenditSessionId,
    );
    if (pending?.xenditSessionId) {
      try {
        const session = await getXenditPaymentSession(pending.xenditSessionId);
        if (
          session.reference_id !== pending.xenditReferenceId ||
          session.amount !== pending.grossAmount
        ) {
          throw new Error("Xendit payment session does not match the stored order.");
        }

        const finalStatus =
          session.status === "COMPLETED"
            ? "PAID"
            : session.status === "EXPIRED"
              ? "EXPIRED"
              : "PENDING";

        if (finalStatus !== "PENDING") {
          await Payment.updateOne(
            { _id: pending._id, status: "PENDING" },
            {
              $set: {
                status: finalStatus,
                transactionId: session.payment_id ?? undefined,
                xenditPaymentRequestId:
                  session.latest_payment_request_id ??
                  session.payment_request_id ??
                  undefined,
                paidAt: finalStatus === "PAID" ? new Date() : undefined,
              },
            },
          );
          const handoverDeadline = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
          await Order.updateOne(
            { _id: pending.orderId, status: "PENDING_PAYMENT" },
            { $set: finalStatus === "PAID" ? {
              status: "AWAITING_SELLER_HANDOVER",
              "items.$[].handover.status": "AWAITING_SELLER_SCHEDULE",
              "items.$[].handoverDeadline": handoverDeadline,
            } : { status: "EXPIRED" } },
          );
          if (finalStatus === "PAID") {
            const paidOrder = await Order.findById(pending.orderId).lean();
            if (paidOrder) {
              await Product.updateMany(
                { _id: { $in: paidOrder.items.map((item) => item.productId) }, status: "RESERVED" },
                { $set: { status: "SOLD_PENDING_HANDOVER" } },
              );
              const reward = Math.floor(paidOrder.subtotal * GREEN_POINT_REWARDS.purchaseRate);
              if (reward > 0) {
                await awardGreenPoints({
                  userId: paidOrder.buyerId.toString(),
                  amount: reward,
                  description: "Completed marketplace purchase reward",
                  referenceKey: `purchase:${paidOrder._id.toString()}`,
                });
              }
            }
          }
          payments = await Payment.find(query).sort({ createdAt: -1 }).lean();
        }
      } catch (error) {
        console.error("Could not synchronize Xendit payment status.", error);
      }
    }

    return NextResponse.json({ success: true, data: payments });
  } catch (error) {
    console.error("Get payments error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to retrieve payments." },
      { status: 500 },
    );
  }
}
