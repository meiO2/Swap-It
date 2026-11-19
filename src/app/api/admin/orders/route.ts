import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { requireRole } from "@/lib/authorization";
import { connectDB } from "@/lib/mongodb";
import { createNotificationsForMany } from "@/lib/notifications";
import Order from "@/models/Order";

export async function GET() {
  try {
    const auth = await requireRole(["ADMIN"]);
    if (!auth.success) return auth.response;
    await connectDB();

    const orders = await Order.find({ status: { $in: ["PROCESSING", "SHIPPED"] } })
      .select("_id buyerId status createdAt deliveryMethod courierName items.name")
      .populate("buyerId", "name")
      .sort({ createdAt: 1 })
      .limit(200)
      .lean();
    return NextResponse.json({ success: true, data: orders });
  } catch (error) {
    console.error("Get admin orders error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to retrieve delivery orders." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(["ADMIN"]);
  if (!auth.success) return auth.response;

  try {
    await connectDB();
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return NextResponse.json(
        { success: false, message: "Invalid request body." },
        { status: 400 },
      );
    }

    const input = body as Record<string, unknown>;
    if (
      typeof input.orderId !== "string" ||
      !mongoose.isValidObjectId(input.orderId) ||
      (input.action !== "SHIPPED" && input.action !== "DELIVERED") ||
      (input.reference !== undefined &&
        (typeof input.reference !== "string" || input.reference.length > 200)) ||
      (input.note !== undefined &&
        (typeof input.note !== "string" || input.note.length > 1000))
    ) {
      return NextResponse.json(
        { success: false, message: "A valid order ID and delivery action are required." },
        { status: 400 },
      );
    }
    const action = input.action;
    const orderId = input.orderId;

    const session = await mongoose.startSession();
    let updatedOrder: { id: string; status: string } | null = null;
    try {
      await session.withTransaction(async () => {
        const order = await Order.findById(orderId).session(session);
        if (!order) throw new Error("Order not found.");

        if (action === "SHIPPED") {
          if (order.status !== "PROCESSING") {
            throw new Error("Only QC-cleared orders can be marked SHIPPED.");
          }
          if (
            order.items.some(
              (item) =>
                item.qcStatus !== "PASSED" &&
                item.qcStatus !== "BUYER_ACCEPTED",
            )
          ) {
            throw new Error("All order items must pass QC or be accepted before shipping.");
          }
          order.status = "SHIPPED";
        } else {
          if (order.status !== "SHIPPED") {
            throw new Error("An order must be marked SHIPPED before DELIVERED.");
          }
          order.status = "DELIVERED";
        }

        order.shipmentEvents ??= [];
        order.shipmentEvents.push({
          status: action,
          recordedBy: new mongoose.Types.ObjectId(auth.user.id),
          recordedAt: new Date(),
          reference:
            typeof input.reference === "string"
              ? input.reference.trim()
              : undefined,
          note: typeof input.note === "string" ? input.note.trim() : undefined,
        });
        await order.save({ session });

        await createNotificationsForMany({
          recipientIds: [order.buyerId.toString()],
          senderId: auth.user.id,
          type: "ORDER_UPDATE",
          title: action === "SHIPPED" ? "Order shipped" : "Order delivered",
          message:
            action === "SHIPPED"
              ? "An admin recorded your order as shipped."
              : "Your order was marked delivered. Confirm receipt to complete the order.",
          link: `/orders/${order._id.toString()}`,
          session,
        });
        updatedOrder = { id: order._id.toString(), status: order.status };
      });
    } finally {
      await session.endSession();
    }

    return NextResponse.json({ success: true, data: updatedOrder });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update delivery status.";
    const notFound = message === "Order not found.";
    const conflict = [
      "Only QC-cleared orders can be marked SHIPPED.",
      "All order items must pass QC or be accepted before shipping.",
      "An order must be marked SHIPPED before DELIVERED.",
    ].includes(message);
    const status = notFound ? 404 : conflict ? 409 : 500;
    if (status === 500) console.error("Update admin delivery status error:", error);
    return NextResponse.json({ success: false, message }, { status });
  }
}
