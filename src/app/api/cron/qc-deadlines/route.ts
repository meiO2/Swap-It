import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import { awardGreenPoints } from "@/lib/green-points";
import { createHandoverDeadlineRefund, orderHasActiveRefund } from "@/lib/refunds";
import { touchSettlementOrderFence } from "@/lib/settlement-order-fence";
import Order from "@/models/Order";
import Product from "@/models/Product";
import { createNotificationsForMany } from "@/lib/notifications";

// Runs daily in Vercel. Stable GP reference keys make retries idempotent.
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return NextResponse.json({ success: false, message: "Cron configuration error." }, { status: 500 });
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });

  try {
    await connectDB();
    const now = new Date();
    let handoverExpired = 0, autoAccepted = 0, transferredToRevamp = 0;

    const handoverOrders = await Order.find({ status: { $in: ["PAID", "AWAITING_SELLER_HANDOVER"] }, items: { $elemMatch: { handoverDeadline: { $lte: now }, "handover.status": { $in: ["AWAITING_PAYMENT", "AWAITING_SELLER_SCHEDULE", "SCHEDULED"] } } } });
    for (const candidate of handoverOrders) {
      const session = await mongoose.startSession();
      try {
        const processed = await session.withTransaction(async () => {
          await touchSettlementOrderFence(candidate._id, session);
          const order = await Order.findOne({
            _id: candidate._id,
            status: { $in: ["PAID", "AWAITING_SELLER_HANDOVER"] },
          }).session(session);
          if (!order) return 0;
          const expired = order.items.filter((item) => item.handoverDeadline && item.handoverDeadline <= now && item.handover && ["AWAITING_PAYMENT", "AWAITING_SELLER_SCHEDULE", "SCHEDULED"].includes(item.handover.status));
          if (!expired.length) return 0;
          for (const item of expired) {
            item.handover!.status = "EXPIRED";
            await Product.updateOne({ _id: item.productId }, { $set: { status: "AVAILABLE" } }, { session });
          }
          order.status = "CANCELLED";
          await order.save({ session });
          await createHandoverDeadlineRefund({ orderId: order._id, session });
          await createNotificationsForMany({ recipientIds: [order.buyerId.toString(), ...expired.map((item) => item.sellerId.toString())], type: "ORDER_UPDATE", title: "Seller handover deadline expired", message: "The handover deadline elapsed and the affected item is no longer proceeding through this order.", link: `/orders/${order._id.toString()}`, session });
          return expired.length;
        });
        handoverExpired += processed ?? 0;
      } finally {
        await session.endSession();
      }
    }

    const qcOrders = await Order.find({ items: { $elemMatch: { qcStatus: "FAILED_AWAITING_BUYER", qcDecisionDeadline: { $lte: now } } } });
    for (const candidate of qcOrders) {
      const session = await mongoose.startSession();
      try {
        const processed = await session.withTransaction(async () => {
          await touchSettlementOrderFence(candidate._id, session);
          const order = await Order.findById(candidate._id).session(session);
          if (!order || ["CANCELLED", "REFUNDED", "EXPIRED"].includes(order.status) ||
            await orderHasActiveRefund(candidate._id, session)) return 0;
          let count = 0;
          for (const item of order.items) {
            if (item.qcStatus === "FAILED_AWAITING_BUYER" && item.qcDecisionDeadline && item.qcDecisionDeadline <= now) {
              item.qcStatus = "EXPIRED";
              item.buyerQcDecision = "ACCEPT";
              item.buyerQcDecisionAt = now;
              await Product.updateOne({ _id: item.productId }, { $set: { status: "READY_TO_SHIP" } }, { session });
              await createNotificationsForMany({ recipientIds: [order.buyerId.toString(), item.sellerId.toString()], type: "QC_UPDATE", title: "QC decision deadline reached", message: "The buyer decision window has ended and the item will proceed through the accepted QC path.", link: `/orders/${order._id.toString()}`, session });
              count += 1;
            }
          }
          if (count) { order.status = "PROCESSING"; await order.save({ session }); }
          return count;
        });
        autoAccepted += processed ?? 0;
      } finally {
        await session.endSession();
      }
    }

    const returnOrders = await Order.find({ items: { $elemMatch: { returnStatus: { $in: ["AWAITING_SELLER", "RETURN_SHIPMENT_REQUESTED"] }, returnDeadline: { $lte: now } } } });
    for (const order of returnOrders) {
      let changed = false;
      for (const item of order.items) {
        if (item.returnDeadline && item.returnDeadline <= now && ["AWAITING_SELLER", "RETURN_SHIPMENT_REQUESTED"].includes(item.returnStatus ?? "")) {
          item.returnStatus = "TRANSFERRED_TO_REVAMP";
          item.revampCompensationGrantedAt = now;
          await Product.updateOne({ _id: item.productId }, { $set: { status: "TRANSFERRED_TO_REVAMP" } });
          const compensation = Math.floor((item.listingPriceSnapshot ?? item.price) * 0.5);
          if (compensation > 0) await awardGreenPoints({ userId: item.sellerId.toString(), amount: compensation, type: "EARN", description: "50% listing-price compensation after transfer to Revamp", referenceKey: `revamp-transfer:${order._id}:${item.productId}` });
          await createNotificationsForMany({ recipientIds: [item.sellerId.toString()], type: "REVAMP_UPDATE", title: "Item transferred to Revamp", message: "The seller retrieval deadline elapsed. The item has entered the Revamp workflow and applicable compensation was processed.", link: "/revamp" });
          changed = true;
          transferredToRevamp++;
        }
      }
      if (changed) await order.save();
    }
    return NextResponse.json({ success: true, handoverExpired, autoAccepted, transferredToRevamp, processedAt: now.toISOString() });
  } catch (error) {
    console.error("Lifecycle deadline cron error:", error);
    return NextResponse.json({ success: false, message: "Could not process lifecycle deadlines." }, { status: 500 });
  }
}
