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

    const orders = await Order.find({ status: { $in: ["PROCESSING", "SHIPPED", "READY_FOR_PICKUP"] } })
      .select("_id buyerId status createdAt deliveryMethod courierName pickupHub items.name")
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
      (input.action !== "SHIPPED" && input.action !== "DELIVERED" &&
        input.action !== "READY_FOR_PICKUP" && input.action !== "PICKED_UP") ||
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

        if (action === "SHIPPED" || action === "READY_FOR_PICKUP") {
          if (order.status !== "PROCESSING") {
            throw new Error("Only QC-cleared orders can be prepared for delivery or pickup.");
          }
          if ((action === "SHIPPED") !== (order.deliveryMethod === "courier")) {
            throw new Error("Delivery action does not match the order method.");
          }
          if (action === "READY_FOR_PICKUP" && !order.pickupHub?.id) {
            throw new Error("Pickup hub is missing.");
          }
          if (
            order.items.some(
              (item) =>
                item.qcStatus !== "PASSED" &&
                item.qcStatus !== "BUYER_ACCEPTED",
            )
          ) {
            throw new Error("All order items must pass QC or be accepted before delivery or pickup.");
          }
          order.status = action;
        } else {
          if (action === "DELIVERED" && (order.deliveryMethod !== "courier" || order.status !== "SHIPPED")) {
            throw new Error("A courier order must be shipped before delivery.");
          }
          if (action === "PICKED_UP" && (order.deliveryMethod !== "pickup" || order.status !== "READY_FOR_PICKUP")) {
            throw new Error("A pickup order must be ready before collection.");
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
          title: action === "SHIPPED" ? "Order shipped" : action === "READY_FOR_PICKUP" ? "Order ready for pickup" : action === "PICKED_UP" ? "Order picked up" : "Order delivered",
          message:
            action === "SHIPPED"
              ? "An admin recorded your order as shipped."
              : action === "READY_FOR_PICKUP"
                ? `Your order is ready for pickup at ${order.pickupHub?.name}.`
                : action === "PICKED_UP"
                  ? "Your pickup was recorded. Confirm receipt to complete the order."
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
      "Only QC-cleared orders can be prepared for delivery or pickup.",
      "Delivery action does not match the order method.",
      "Pickup hub is missing.",
      "All order items must pass QC or be accepted before delivery or pickup.",
      "A courier order must be shipped before delivery.",
      "A pickup order must be ready before collection.",
    ].includes(message);
    const status = notFound ? 404 : conflict ? 409 : 500;
    if (status === 500) console.error("Update admin delivery status error:", error);
    return NextResponse.json({ success: false, message }, { status });
  }
}
