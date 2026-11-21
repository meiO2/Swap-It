import { Types, type ClientSession } from "mongoose";
import Order from "@/models/Order";
import Product from "@/models/Product";
import { consumeReservedGreenPoints } from "@/lib/green-points";
import { createNotificationsForMany } from "@/lib/notifications";

export class PaymentFinalizationConflict extends Error {}

export async function finalizePaidOrder(
  orderId: string | Types.ObjectId,
  session: ClientSession,
  expected?: { buyerId: Types.ObjectId; amount: number },
) {
  const handoverDeadline = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  const updated = await Order.updateOne(
    {
      _id: orderId,
      status: "PENDING_PAYMENT",
      ...(expected ? { buyerId: expected.buyerId, totalAmount: expected.amount } : {}),
    },
    {
      $set: {
        status: "AWAITING_SELLER_HANDOVER",
        "items.$[].handover.status": "AWAITING_SELLER_SCHEDULE",
        "items.$[].handoverDeadline": handoverDeadline,
      },
    },
    { session },
  );
  if (expected && updated.modifiedCount !== 1) {
    throw new PaymentFinalizationConflict("Order is not eligible for payment finalization.");
  }

  const paidOrder = await Order.findById(orderId).session(session).lean();
  if (expected && paidOrder?.status !== "AWAITING_SELLER_HANDOVER") {
    throw new PaymentFinalizationConflict("Order could not be finalized.");
  }
  if (paidOrder?.status === "AWAITING_SELLER_HANDOVER") {
    const reservation = await consumeReservedGreenPoints({ orderId: paidOrder._id.toString(), session });
    if (expected && (
      (paidOrder.gpUsed > 0 && (
        reservation?.status !== "PENDING" ||
        reservation.amount !== paidOrder.gpUsed ||
        !reservation.userId.equals(paidOrder.buyerId)
      )) ||
      (paidOrder.gpUsed === 0 && reservation && reservation.amount !== 0)
    )) {
      throw new PaymentFinalizationConflict("Green Point reservation does not match the order.");
    }
    const products = await Product.updateMany(
      { _id: { $in: paidOrder.items.map((item) => item.productId) }, status: "RESERVED" },
      { $set: { status: "SOLD_PENDING_HANDOVER" } },
      { session },
    );
    if (expected && products.modifiedCount !== new Set(paidOrder.items.map((item) => item.productId.toString())).size) {
      throw new PaymentFinalizationConflict("Reserved products do not match the order.");
    }
    const sellerIds = [...new Set(paidOrder.items.map((item) => item.sellerId.toString()))];
    await createNotificationsForMany({
      recipientIds: sellerIds,
      senderId: paidOrder.buyerId.toString(),
      type: "ORDER_UPDATE",
      title: "New order received",
      message:
        "A buyer has placed an order for your product. Please choose drop-off or pickup and hand it over within 3 calendar days.",
      link: "/orders",
      session,
    });
  }
}
