import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { requireAuth } from "@/lib/authorization";
import { connectDB } from "@/lib/mongodb";
import Order from "@/models/Order";
import Product from "@/models/Product";
import { awardGreenPoints } from "@/lib/green-points";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(
  _request: Request,
  { params }: RouteContext,
) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const { id } = await params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json(
      { success: false, message: "Invalid order ID." },
      { status: 400 },
    );
  }

  await connectDB();
  const session = await mongoose.startSession();
  try {
    let cancelled = false;
    await session.withTransaction(async () => {
      const order = await Order.findOne({
        _id: id,
        buyerId: auth.user.id,
        status: "PENDING_PAYMENT",
      }).session(session);
      if (!order) throw new Error("Only pending payment orders can be cancelled.");

      await Order.updateOne(
        { _id: id, status: "PENDING_PAYMENT" },
        { $set: { status: "CANCELLED" } },
        { session },
      );
      await Product.updateMany(
        { _id: { $in: order.items.map((item) => item.productId) }, status: "RESERVED" },
        { $set: { status: "AVAILABLE" } },
        { session },
      );
      if (order.gpUsed > 0) {
        await awardGreenPoints({
          userId: auth.user.id,
          amount: order.gpUsed,
          type: "REFUND",
          description: "Green Points returned after order cancellation",
          referenceKey: `order:${order._id.toString()}:gp-refund`,
          session,
        });
      }
      cancelled = true;
    });

    return NextResponse.json({
      success: true,
      message: cancelled ? "Order cancelled and products released." : "Order was not cancelled.",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to cancel order.";
    console.error("Cancel order error:", error);
    return NextResponse.json(
      {
        success: false,
        message:
          message === "Only pending payment orders can be cancelled."
            ? message
            : "Failed to cancel order.",
      },
      { status: message === "Only pending payment orders can be cancelled." ? 409 : 500 },
    );
  } finally {
    await session.endSession();
  }
}
