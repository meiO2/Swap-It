import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/authorization";
import { connectDB } from "@/lib/mongodb";
import Order from "@/models/Order";
import Product from "@/models/Product";

type RouteContext = { params: Promise<{ id: string }> };

// Seller selects a return route after a buyer rejects a QC report. Actual
// return-shipping payment is deliberately separate from this state change.
export async function POST(request: NextRequest, { params }: RouteContext) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) return NextResponse.json({ success: false, message: "Invalid order ID." }, { status: 400 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body.productId !== "string" || !mongoose.isValidObjectId(body.productId) || !["HUB_PICKUP", "RETURN_SHIPMENT"].includes(body.method)) {
    return NextResponse.json({ success: false, message: "productId and a valid return method are required." }, { status: 400 });
  }
  await connectDB();
  const order = await Order.findOne({ _id: id, "items.productId": body.productId, "items.sellerId": auth.user.id });
  const item = order?.items.find((entry) => entry.productId.toString() === body.productId && entry.sellerId.toString() === auth.user.id);
  if (!order || !item || item.returnStatus !== "AWAITING_SELLER") return NextResponse.json({ success: false, message: "This item is not awaiting seller retrieval." }, { status: 409 });
  if (body.method === "HUB_PICKUP") {
    item.returnStatus = "RETURNED";
    await Product.updateOne({ _id: item.productId }, { $set: { status: "RETURNED" } });
  } else {
    item.returnStatus = "RETURN_SHIPMENT_REQUESTED";
  }
  await order.save();
  return NextResponse.json({ success: true, data: { orderId: id, productId: body.productId, returnStatus: item.returnStatus } });
}
