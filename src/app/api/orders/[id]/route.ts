import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { requireAuth } from "@/lib/authorization";
import { connectDB } from "@/lib/mongodb";
import Order from "@/models/Order";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(
  _request: NextRequest,
  { params }: RouteContext,
) {
  try {
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
    const userId = new mongoose.Types.ObjectId(auth.user.id);
    const order = await Order.findOne({
      _id: id,
      $or: [{ buyerId: userId }, { "items.sellerId": userId }],
    }).lean();
    if (!order) {
      return NextResponse.json(
        { success: false, message: "Order not found." },
        { status: 404 },
      );
    }
    return NextResponse.json({
      success: true,
      data: {
        ...order,
        id: order._id.toString(),
        items: order.items.map((item) => ({
          ...item,
          productId: item.productId.toString(),
          sellerId: item.sellerId.toString(),
        })),
      },
    });
  } catch (error) {
    console.error("Get order error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to retrieve order." },
      { status: 500 },
    );
  }
}
