import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/authorization";
import { connectDB } from "@/lib/mongodb";
import Order from "@/models/Order";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;
  try {
    const { id } = await context.params;
    if (!mongoose.isValidObjectId(id)) return NextResponse.json({ success: false, message: "Invalid order ID." }, { status: 400 });
    await connectDB();
    const order = await Order.findOne({ _id: id, userId: auth.user.id }).lean();
    if (!order) return NextResponse.json({ success: false, message: "Order not found." }, { status: 404 });
    return NextResponse.json({ success: true, data: { ...order, id: String(order._id) } });
  } catch (error) {
    console.error("Get order error:", error);
    return NextResponse.json({ success: false, message: "Could not load this order." }, { status: 500 });
  }
}
