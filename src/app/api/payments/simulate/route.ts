import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { requireAuth } from "@/lib/authorization";
import { connectDB } from "@/lib/mongodb";
import { isXenditTestMode, simulateXenditQrPayment } from "@/lib/xendit";
import Order from "@/models/Order";
import Payment from "@/models/Payment";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.success) return auth.response;
    if (!isXenditTestMode()) {
      return NextResponse.json(
        { success: false, message: "Payment simulation is only available in test mode." },
        { status: 404 },
      );
    }

    const body = await request.json();
    const orderId = body?.orderId;
    if (typeof orderId !== "string" || !mongoose.Types.ObjectId.isValid(orderId)) {
      return NextResponse.json(
        { success: false, message: "A valid orderId is required." },
        { status: 400 },
      );
    }

    await connectDB();
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

    const payment = await Payment.findOne({
      orderId: order._id,
      userId: auth.user.id,
      status: "PENDING",
    }).lean();
    const expectedReferenceId = `swapit-${order._id.toString()}`;
    if (
      !payment?.xenditQrCodeId ||
      payment.xenditReferenceId !== expectedReferenceId ||
      payment.grossAmount !== order.totalAmount
    ) {
      return NextResponse.json(
        { success: false, message: "A matching pending QRIS payment was not found." },
        { status: 409 },
      );
    }

    const result = await simulateXenditQrPayment({
      externalId: payment.xenditReferenceId,
      amount: payment.grossAmount,
    });
    return NextResponse.json({
      success: true,
      data: { status: result.status ?? "PENDING" },
    });
  } catch (error) {
    console.error("Simulate Xendit payment error:", error);
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Could not simulate payment.",
      },
      { status: 500 },
    );
  }
}
