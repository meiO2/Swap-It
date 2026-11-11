import mongoose from "mongoose";
import Order from "@/models/Order";
import Payment from "@/models/Payment";
import Refund, { type RefundReason } from "@/models/Refund";
import RefundTransaction from "@/models/RefundTransaction";
import { awardGreenPoints } from "@/lib/green-points";
import { getXenditServerKeyConfigured, refundXenditPayment } from "@/lib/xendit";

export function serializeRefund(refund: object) { const value = refund as { _id: unknown; orderId: unknown; userId: unknown }; return { ...refund, id: String(value._id), orderId: String(value.orderId), userId: String(value.userId), _id: undefined }; }
export async function getRefundableOrder(orderId: string, userId: string) {
  if (!mongoose.isValidObjectId(orderId)) return null;
  return Order.findOne({ _id: orderId, buyerId: userId });
}
export function isRefundEligible(status: string) { return ["PAID", "PROCESSING", "SHIPPED", "DELIVERED", "COMPLETED"].includes(status); }
export async function approveRefund(refundId: string, reviewerId: string, note = "") {
  const refund = await Refund.findOneAndUpdate({ _id: refundId, status: { $in: ["REQUESTED", "UNDER_REVIEW"] } }, { $set: { status: "PROCESSING", reviewedBy: reviewerId, reviewedAt: new Date(), reviewerNote: note }, $push: { auditLog: { status: "APPROVED", note, actorId: reviewerId, at: new Date() } } }, { new: true });
  if (!refund) return null;
  const order = await Order.findById(refund.orderId);
  if (!order) throw new Error("Order not found.");
  const payment = await Payment.findOne({ orderId: order._id, status: "PAID" });
  const isQc = refund.reason === "QUALITY_INSPECTION_FAILED";
  const cashProduct = isQc ? 0 : Math.max(0, order.subtotal - order.gpUsed);
  const gpProduct = isQc ? order.subtotal : order.gpUsed;
  const components = [
    ...(cashProduct ? [{ component: "PRODUCT", refundType: "CASH", amount: cashProduct, provider: "XENDIT" }] : []),
    ...(gpProduct ? [{ component: "PRODUCT", refundType: "GP", amount: gpProduct, provider: "INTERNAL_GP" }] : []),
    ...(order.shippingFee ? [{ component: "SHIPPING", refundType: "CASH", amount: order.shippingFee, provider: "XENDIT" }] : []),
    ...(order.serviceFee ? [{ component: "SERVICE_FEE", refundType: "CASH", amount: order.serviceFee, provider: "XENDIT" }] : []),
  ] as const;
  for (const entry of components) {
    const key = `refund:${refund._id}:${entry.component}:${entry.refundType}`;
    if (entry.refundType === "GP") {
      await awardGreenPoints({ userId: refund.userId.toString(), amount: entry.amount, type: "REFUND", description: isQc ? "QC failure compensation" : "Order refund", referenceKey: key });
      await RefundTransaction.updateOne({ idempotencyKey: key }, { $setOnInsert: { refundId: refund._id, orderId: order._id, ...entry, status: "COMPLETED", idempotencyKey: key, processedAt: new Date(), providerReference: key } }, { upsert: true });
    } else {
      if (!payment) { await RefundTransaction.updateOne({ idempotencyKey: key }, { $setOnInsert: { refundId: refund._id, orderId: order._id, ...entry, status: "FAILED", idempotencyKey: key, failureReason: "No settled cash payment found." } }, { upsert: true }); continue; }
      if (!payment.xenditPaymentRequestId) { await RefundTransaction.updateOne({ idempotencyKey: key }, { $setOnInsert: { refundId: refund._id, orderId: order._id, ...entry, status: "FAILED", idempotencyKey: key, failureReason: "Xendit payment request reference is missing." } }, { upsert: true }); continue; }
      if (!getXenditServerKeyConfigured()) { await RefundTransaction.updateOne({ idempotencyKey: key }, { $setOnInsert: { refundId: refund._id, orderId: order._id, ...entry, status: "PENDING", idempotencyKey: key, failureReason: "Xendit is not configured." } }, { upsert: true }); continue; }
      try {
        const result = await refundXenditPayment({ paymentRequestId: payment.xenditPaymentRequestId, referenceId: key, amount: entry.amount });
        const status = result.status === "SUCCEEDED" ? "COMPLETED" : result.status === "PENDING" ? "PENDING" : "FAILED";
        await RefundTransaction.updateOne({ idempotencyKey: key }, { $setOnInsert: { refundId: refund._id, orderId: order._id, ...entry, idempotencyKey: key }, $set: { status, processedAt: status === "COMPLETED" ? new Date() : undefined, providerReference: result.id ?? key, failureReason: status === "FAILED" ? "Xendit refund was not successful." : undefined } }, { upsert: true });
      } catch (error) { await RefundTransaction.updateOne({ idempotencyKey: key }, { $setOnInsert: { refundId: refund._id, orderId: order._id, ...entry, idempotencyKey: key }, $set: { status: "FAILED", failureReason: error instanceof Error ? error.message : "Xendit refund failed." } }, { upsert: true }); }
    }
  }
  const transactions = await RefundTransaction.find({ refundId: refund._id }).lean();
  const hasPending = transactions.some((item) => item.status === "PENDING");
  const hasFailed = transactions.some((item) => item.status === "FAILED");
  const hasCompleted = transactions.some((item) => item.status === "COMPLETED");
  const status = hasPending || (hasFailed && hasCompleted) ? "PARTIALLY_COMPLETED" : hasFailed ? "FAILED" : "COMPLETED";
  return Refund.findByIdAndUpdate(refund._id, { $set: { status, totalApprovedAmount: components.reduce((total, item) => total + item.amount, 0) }, $push: { auditLog: { status, note: hasPending ? "GP processed; cash refund awaits Xendit processing." : hasFailed ? "One or more refund components failed." : "All refund components completed.", actorId: reviewerId, at: new Date() } } }, { new: true });
}
export async function createQcCompensation(input: { orderId: string; userId: string; productId: string }) {
  const order = await getRefundableOrder(input.orderId, input.userId);
  if (!order) throw new Error("Order not found.");
  const item = order.items.find((entry) => entry.productId.toString() === input.productId);
  if (!item) throw new Error("Product not found in this order.");
  const existing = await Refund.findOne({ orderId: order._id, reason: "QUALITY_INSPECTION_FAILED", "auditLog.note": input.productId });
  if (existing) return existing;
  // QC cancellation returns the product value (including redeemed GP) and the
  // paid service fee as GP. Shipping is excluded because shipment never starts.
  const refundAmount = order.subtotal + order.serviceFee;
  const refund = await Refund.create({ orderId: order._id, userId: input.userId, reason: "QUALITY_INSPECTION_FAILED", description: "Automatic Green Point refund following buyer rejection of a QC report.", status: "PROCESSING", totalApprovedAmount: refundAmount, auditLog: [{ status: "APPROVED", note: input.productId, at: new Date() }] });
  const gpKey = `qc-refund:${order._id}:gp`;
  await awardGreenPoints({ userId: input.userId, amount: refundAmount, type: "REFUND", description: "Product value and service fee returned as Green Points after QC rejection", referenceKey: gpKey });
  await RefundTransaction.create({ refundId: refund._id, orderId: order._id, component: "PRODUCT", refundType: "GP", amount: refundAmount, status: "COMPLETED", provider: "INTERNAL_GP", providerReference: gpKey, idempotencyKey: gpKey, processedAt: new Date() });
  const transactions = await RefundTransaction.find({ refundId: refund._id }).lean();
  const hasPending = transactions.some((entry) => entry.status === "PENDING"); const hasFailed = transactions.some((entry) => entry.status === "FAILED"); const hasCompleted = transactions.some((entry) => entry.status === "COMPLETED");
  const status = hasPending || (hasFailed && hasCompleted) ? "PARTIALLY_COMPLETED" : hasFailed ? "FAILED" : "COMPLETED";
  return Refund.findByIdAndUpdate(refund._id, { $set: { status }, $push: { auditLog: { status, note: "Full QC refund issued as Green Points.", at: new Date() } } }, { new: true });
}
export function validReason(value: unknown): value is RefundReason { return typeof value === "string" && ["SELLER_CANCELLED", "QUALITY_INSPECTION_FAILED", "ITEM_LOST", "ITEM_DAMAGED", "ITEM_NOT_AS_DESCRIBED", "BUYER_CANCELLATION", "OTHER"].includes(value); }
