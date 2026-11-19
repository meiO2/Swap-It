import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { requireAuth } from "@/lib/authorization";
import { connectDB } from "@/lib/mongodb";
import { createNotificationsForMany } from "@/lib/notifications";
import { createSellerPayablesForCompletedOrder } from "@/lib/seller-settlement";
import Order from "@/models/Order";
import { touchSettlementOrderFence } from "@/lib/settlement-order-fence";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(
  _request: Request,
  { params }: RouteContext,
) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  try {
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json(
        { success: false, message: "Invalid order ID." },
        { status: 400 },
      );
    }
    await connectDB();

    const session = await mongoose.startSession();
    let completed = false;
    try {
      await session.withTransaction(async () => {
        await touchSettlementOrderFence(new mongoose.Types.ObjectId(id), session);
        const order = await Order.findOne({
          _id: id,
          buyerId: auth.user.id,
        }).session(session);
        if (!order) throw new Error("Order not found.");
        if (order.status === "COMPLETED") {
          completed = true;
          return;
        }
        if (order.status !== "DELIVERED") {
          throw new Error("Only a delivered order can be confirmed as received.");
        }

        order.status = "COMPLETED";
        order.completedAt = new Date();
        await order.save({ session });
        await createSellerPayablesForCompletedOrder(order, session);

        const sellerIds = [
          ...new Set(order.items.map((item) => item.sellerId.toString())),
        ];
        await createNotificationsForMany({
          recipientIds: sellerIds,
          senderId: auth.user.id,
          type: "ORDER_UPDATE",
          title: "Order completed",
          message: "The buyer confirmed receipt. Your seller payable is now pending settlement.",
          link: `/orders/${order._id.toString()}`,
          session,
        });
        completed = true;
      });
    } finally {
      await session.endSession();
    }

    return NextResponse.json({
      success: true,
      message: "Order receipt confirmed.",
      data: { orderId: id, status: "COMPLETED", completed },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not confirm order receipt.";
    const status = message === "Order not found."
      ? 404
      : message === "Only a delivered order can be confirmed as received."
        ? 409
        : message === "Seller payables cannot be created while an order refund is in progress."
          ? 409
        : 500;
    if (status === 500) console.error("Confirm order receipt error:", error);
    return NextResponse.json({ success: false, message }, { status });
  }
}
