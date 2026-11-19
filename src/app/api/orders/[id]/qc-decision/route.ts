import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/authorization";
import { connectDB } from "@/lib/mongodb";
import { createNotificationsForMany } from "@/lib/notifications";
import { createQcCompensation, orderHasActiveRefund } from "@/lib/refunds";
import { touchSettlementOrderFence } from "@/lib/settlement-order-fence";
import Order from "@/models/Order";
import Product from "@/models/Product";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
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

    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return NextResponse.json(
        { success: false, message: "Invalid request body." },
        { status: 400 },
      );
    }
    const input = body as Record<string, unknown>;
    if (
      typeof input.productId !== "string" ||
      !mongoose.isValidObjectId(input.productId) ||
      (input.decision !== "ACCEPT" && input.decision !== "REJECT")
    ) {
      return NextResponse.json(
        { success: false, message: "Valid productId and decision are required." },
        { status: 400 },
      );
    }
    const productId = input.productId;
    const decision = input.decision;

    await connectDB();
    const session = await mongoose.startSession();
    let response:
      | {
          productId: string;
          decision: "ACCEPT" | "REJECT";
          qcStatus: string;
          orderStatus: string;
          refundAmount: number;
          refundPending: boolean;
        }
      | undefined;
    try {
      response = await session.withTransaction(async () => {
        await touchSettlementOrderFence(new mongoose.Types.ObjectId(id), session);
        const order = await Order.findOne({
          _id: id,
          buyerId: new mongoose.Types.ObjectId(auth.user.id),
        }).session(session);
        if (!order) throw new Error("Order not found.");
        if (["CANCELLED", "REFUNDED", "EXPIRED"].includes(order.status) ||
          await orderHasActiveRefund(order._id, session)) {
          throw new Error("QC is unavailable while refund resolution is in progress.");
        }

        const item = order.items.find(
          (entry) => entry.productId.toString() === productId,
        );
        if (!item) throw new Error("Product not found in this order.");
        if (item.qcStatus !== "FAILED_AWAITING_BUYER") {
          throw new Error("This product is not awaiting a buyer decision.");
        }
        if (
          !item.qcDecisionDeadline ||
          new Date() > new Date(item.qcDecisionDeadline)
        ) {
          throw new Error("The buyer decision deadline has expired.");
        }

        item.buyerQcDecision = decision;
        item.buyerQcDecisionAt = new Date();
        let refundAmount = 0;
        let refundPending = false;

        if (decision === "ACCEPT") {
          item.qcStatus = "BUYER_ACCEPTED";
          await Product.updateOne(
            { _id: item.productId },
            { $set: { status: "READY_TO_SHIP" } },
            { session },
          );
          const allQcResolved = order.items.every(
            (entry) =>
              entry.qcStatus === "PASSED" ||
              entry.qcStatus === "BUYER_ACCEPTED",
          );
          const unresolvedBuyerDecisions = order.items.some(
            (entry) => entry.qcStatus === "FAILED_AWAITING_BUYER",
          );
          order.status = allQcResolved
            ? "PROCESSING"
            : unresolvedBuyerDecisions
              ? "AWAITING_BUYER_CONFIRMATION"
              : "QC_IN_PROGRESS";
        } else {
          item.qcStatus = "BUYER_REJECTED";
          refundAmount = order.subtotal;
          const returnDeadline = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
          for (const orderItem of order.items) {
            orderItem.returnStatus = "AWAITING_SELLER";
            orderItem.returnDeadline = returnDeadline;
          }
          order.status = "CANCELLED";
          await Product.updateMany(
            { _id: { $in: order.items.map((entry) => entry.productId) } },
            { $set: { status: "RETURN_PENDING" } },
            { session },
          );
        }

        await order.save({ session, validateModifiedOnly: true });

        if (decision === "REJECT") {
          const refund = await createQcCompensation({
            orderId: id,
            userId: auth.user.id,
            productId,
            session,
          });
          if (!refund) throw new Error("QC refund could not be created.");
          refundPending = refund.status === "PROCESSING";
          const sellerIds = [
            ...new Set(order.items.map((entry) => entry.sellerId.toString())),
          ];
          await createNotificationsForMany({
            recipientIds: sellerIds,
            type: "ORDER_UPDATE",
            title: "Items awaiting retrieval",
            message:
              "The order was cancelled after the QC decision. Retrieve all items or request return delivery within 14 calendar days.",
            link: `/orders/${order._id.toString()}`,
            session,
          });
        }

        await createNotificationsForMany({
          recipientIds: [auth.user.id],
          type: "QC_UPDATE",
          title: decision === "REJECT" ? "Order cancelled after QC" : "QC decision recorded",
          message:
            decision === "REJECT"
              ? refundPending
                ? "The full product value is recorded as a pending Green Point refund and will be credited after reserve funding."
                : "The full product value was refunded as Green Points."
              : "Your choice was recorded. The order will continue to shipping after all items clear QC.",
          link: `/orders/${order._id.toString()}`,
          session,
        });

        return {
          productId: item.productId.toString(),
          decision,
          qcStatus: item.qcStatus ?? "NOT_STARTED",
          orderStatus: order.status,
          refundAmount,
          refundPending,
        };
      });
    } finally {
      await session.endSession();
    }

    if (!response) {
      throw new Error("QC decision did not complete.");
    }
    return NextResponse.json({
      success: true,
      message:
        decision === "REJECT"
          ? "The order was cancelled. Product-value refund GP was recorded."
          : "Your QC decision was recorded.",
      data: { orderId: id, ...response },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save your QC decision.";
    const status =
      message === "Order not found." || message === "Product not found in this order."
        ? 404
        : message === "The buyer decision deadline has expired."
          ? 410
          : [
                "This product is not awaiting a buyer decision.",
                "QC is unavailable while refund resolution is in progress.",
              ].includes(message)
            ? 409
            : 500;
    if (status === 500) console.error("Buyer QC decision error:", error);
    return NextResponse.json({ success: false, message }, { status });
  }
}
