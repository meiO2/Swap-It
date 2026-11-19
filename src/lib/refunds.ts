import mongoose, { type ClientSession } from "mongoose";
import Order from "@/models/Order";
import Refund, { type RefundReason } from "@/models/Refund";
import RefundTransaction from "@/models/RefundTransaction";
import BuyerRefundEntitlement from "@/models/BuyerRefundEntitlement";
import SellerFinancialResolution from "@/models/SellerFinancialResolution";
import GreenPointLedger from "@/models/GreenPointLedger";
import PendingGreenPointCredit from "@/models/PendingGreenPointCredit";
import {
  queueGreenPointRefund,
  reverseOrderGreenPointRewards,
} from "@/lib/green-points";
import { touchSettlementOrderFence } from "@/lib/settlement-order-fence";

export function serializeRefund(refund: object) {
  const value = refund as {
    _id: unknown;
    orderId: unknown;
    userId: unknown;
  };
  return {
    ...refund,
    id: String(value._id),
    orderId: String(value.orderId),
    userId: String(value.userId),
    _id: undefined,
  };
}

export async function getRefundableOrder(orderId: string, userId: string) {
  if (!mongoose.isValidObjectId(orderId)) return null;
  return Order.findOne({ _id: orderId, buyerId: userId });
}

export function isRefundEligible(status: string) {
  return [
    "PAID",
    "AWAITING_SELLER_HANDOVER",
    "RECEIVED",
    "QC_IN_PROGRESS",
    "AWAITING_BUYER_CONFIRMATION",
    "PROCESSING",
    "SHIPPED",
    "DELIVERED",
    "COMPLETED",
  ].includes(status);
}

export async function orderHasActiveRefund(orderId: mongoose.Types.ObjectId, session: ClientSession) {
  if (!session.inTransaction()) throw new Error("Refund status requires an active transaction.");
  return Boolean(
    await BuyerRefundEntitlement.exists({ orderId }).session(session) ||
    await Refund.exists({
      orderId,
      status: { $in: ["APPROVED", "PROCESSING", "PARTIALLY_COMPLETED", "COMPLETED"] },
    }).session(session),
  );
}

function isIssuedCredit(
  credit: Awaited<ReturnType<typeof queueGreenPointRefund>>,
) {
  return "status" in credit && credit.status === "ISSUED";
}

async function queueRefundCredit(input: {
  refund: {
    _id: mongoose.Types.ObjectId;
    orderId: mongoose.Types.ObjectId;
    userId: mongoose.Types.ObjectId;
    reason: RefundReason;
  };
  order: {
    subtotal: number;
  };
  session: ClientSession;
}) {
  const key = `refund:${input.refund._id.toString()}:product:gp`;
  await RefundTransaction.updateOne(
    { idempotencyKey: key },
    {
      $setOnInsert: {
        refundId: input.refund._id,
        orderId: input.refund.orderId,
        component: "PRODUCT",
        refundType: "GP",
        amount: input.order.subtotal,
        status: "PENDING",
        provider: "INTERNAL_GP",
        idempotencyKey: key,
      },
    },
    { upsert: true, session: input.session },
  );

  const credit = await queueGreenPointRefund({
    userId: input.refund.userId.toString(),
    amount: input.order.subtotal,
    description:
      input.refund.reason === "QUALITY_INSPECTION_FAILED"
        ? "Full product-value refund after QC failure"
        : "Full product-value refund",
    referenceKey: key,
    components: [
      {
        amount: input.order.subtotal,
        description:
          input.refund.reason === "QUALITY_INSPECTION_FAILED"
            ? "Full product-value refund after QC failure"
            : "Full product-value refund",
        referenceKey: key,
        ledgerType: "REFUND",
      },
    ],
    orderId: input.refund.orderId.toString(),
    refundId: input.refund._id.toString(),
    session: input.session,
  });

  const legacyLedgerAlreadyIssued = !("status" in credit);
  if (isIssuedCredit(credit) || legacyLedgerAlreadyIssued) {
    await RefundTransaction.updateOne(
      { idempotencyKey: key, status: "PENDING" },
      { $set: { status: "COMPLETED", processedAt: new Date() } },
      { session: input.session },
    );
    if (legacyLedgerAlreadyIssued) {
      await Refund.updateOne(
        { _id: input.refund._id, status: "PROCESSING" },
        {
          $set: { status: "COMPLETED" },
          $push: {
            auditLog: {
              status: "COMPLETED",
              note: "Full product-value refund issued as Green Points.",
              at: new Date(),
            },
          },
        },
        { session: input.session },
      );
      if (input.refund.reason !== "QUALITY_INSPECTION_FAILED") {
        await Order.updateOne(
          { _id: input.refund.orderId, status: { $nin: ["CANCELLED", "REFUNDED"] } },
          { $set: { status: "REFUNDED" } },
          { session: input.session },
        );
      }
    }
  }
}

async function recordBuyerRefund(input: {
  refund: {
    _id: mongoose.Types.ObjectId;
    orderId: mongoose.Types.ObjectId;
    userId: mongoose.Types.ObjectId;
    reason: RefundReason;
  };
  order: { subtotal: number };
  session: ClientSession;
}) {
  const { refund, order, session } = input;
  const existing = await BuyerRefundEntitlement.findOne({ orderId: refund.orderId }).session(session);
  if (existing) {
    if (!existing.buyerId.equals(refund.userId) || existing.productAmount !== order.subtotal ||
      !existing.refundId?.equals(refund._id)) {
      throw new Error("This order already has a different buyer refund entitlement.");
    }
    return existing;
  }
  const refunds = await Refund.find({ orderId: refund.orderId }).select("_id").session(session).lean();
  const keys = refunds.flatMap(({ _id }) => [
    `refund:${_id.toString()}:product:gp`,
    `refund:${_id.toString()}:PRODUCT:GP`,
  ]);
  keys.push(`handover-expired:${refund.orderId.toString()}:refund`);
  const historicalTransaction = await RefundTransaction.exists({
    orderId: refund.orderId,
    component: "PRODUCT",
  }).session(session);
  const historicalCredit = await PendingGreenPointCredit.exists({
    $or: [{ referenceKey: { $in: keys } }, { orderId: refund.orderId, source: "REFUND" }],
  }).session(session);
  const historicalLedger = await GreenPointLedger.exists({ referenceKey: { $in: keys } }).session(session);
  const requiresAttention = Boolean(historicalTransaction || historicalCredit || historicalLedger);
  const [entitlement] = await BuyerRefundEntitlement.create([{
    orderId: refund.orderId,
    buyerId: refund.userId,
    refundId: refund._id,
    productAmount: order.subtotal,
    sourceKey: `order:${refund.orderId.toString()}:product-refund`,
    status: requiresAttention ? "FAILED_REQUIRES_ATTENTION" : "GP_PENDING",
  }], { session });
  await SellerFinancialResolution.create([{
    entitlementId: entitlement._id,
    orderId: refund.orderId,
    status: "PENDING",
    revision: 0,
  }], { session });
  if (requiresAttention) {
    await Refund.updateOne(
      { _id: refund._id },
      { $push: { auditLog: {
        status: "PROCESSING",
        note: "Historical product refund requires review before issuing Green Points.",
        at: new Date(),
      } } },
      { session },
    );
    return entitlement;
  }
  await queueRefundCredit(input);
  return entitlement;
}

export async function approveRefund(
  refundId: string,
  reviewerId: string,
  note = "",
) {
  if (!mongoose.isValidObjectId(refundId)) return null;
  const session = await mongoose.startSession();
  let approvedRefund: mongoose.Types.ObjectId | null = null;
  try {
    await session.withTransaction(async () => {
      const candidate = await Refund.findOne({
        _id: refundId,
        status: { $in: ["REQUESTED", "UNDER_REVIEW"] },
      }).select("orderId").session(session).lean();
      if (!candidate) return;
      await touchSettlementOrderFence(candidate.orderId, session);
      const refund = await Refund.findOneAndUpdate(
        {
          _id: refundId,
          status: { $in: ["REQUESTED", "UNDER_REVIEW"] },
        },
        {
          $set: {
            status: "PROCESSING",
            reviewedBy: reviewerId,
            reviewedAt: new Date(),
            reviewerNote: note,
          },
          $push: {
            auditLog: {
              status: "APPROVED",
              note,
              actorId: reviewerId,
              at: new Date(),
            },
          },
        },
        { new: true, session },
      );
      if (!refund) return;
      const order = await Order.findById(refund.orderId).session(session);
      if (!order) throw new Error("Order not found.");

      refund.totalApprovedAmount = order.subtotal;
      await refund.save({ session });
      await reverseOrderGreenPointRewards({
        orderId: order._id.toString(),
        buyerId: order.buyerId.toString(),
        sellerIds: [
          ...new Set(order.items.map((item) => item.sellerId.toString())),
        ],
        session,
      });
      await recordBuyerRefund({ refund, order, session });
      approvedRefund = refund._id;
    });
  } finally {
    await session.endSession();
  }

  if (!approvedRefund) return null;
  return Refund.findById(approvedRefund);
}

export async function createQcCompensation(input: {
  orderId: string;
  userId: string;
  productId: string;
  session?: ClientSession;
}) {
  const execute = async (session: ClientSession) => {
    if (!mongoose.isValidObjectId(input.orderId)) throw new Error("Invalid order ID.");
    await touchSettlementOrderFence(new mongoose.Types.ObjectId(input.orderId), session);
    const order = await Order.findOne({
      _id: input.orderId,
      buyerId: input.userId,
    }).session(session);
    if (!order) throw new Error("Order not found.");
    const item = order.items.find(
      (entry) => entry.productId.toString() === input.productId,
    );
    if (!item) throw new Error("Product not found in this order.");

    const entitlement = await BuyerRefundEntitlement.findOne({ orderId: order._id }).session(session);
    if (entitlement) {
      if (!entitlement.buyerId.equals(order.buyerId) || entitlement.productAmount !== order.subtotal || !entitlement.refundId) {
        throw new Error("Existing buyer refund entitlement requires review.");
      }
      const previousRefund = await Refund.findById(entitlement.refundId).session(session);
      if (!previousRefund) throw new Error("Existing buyer refund record is missing.");
      return previousRefund;
    }
    const existing = await Refund.findOne({
      orderId: order._id,
      reason: "QUALITY_INSPECTION_FAILED",
    }).session(session);
    if (existing) {
      throw new Error("Historical QC refund requires review before it can be reused.");
    }

    const [refund] = await Refund.create(
      [
        {
          orderId: order._id,
          userId: input.userId,
          reason: "QUALITY_INSPECTION_FAILED",
          description:
            "Automatic Green Point refund following buyer rejection of a QC report.",
          status: "PROCESSING",
          totalApprovedAmount: order.subtotal,
          auditLog: [
            {
              status: "APPROVED",
              note: input.productId,
              at: new Date(),
            },
          ],
        },
      ],
      { session },
    );
    await recordBuyerRefund({ refund, order, session });
    const current = await Refund.findById(refund._id).session(session);
    if (!current) throw new Error("QC refund record is missing.");
    return current;
  };

  if (input.session) return execute(input.session);
  const session = await mongoose.startSession();
  try {
    let result: Awaited<ReturnType<typeof execute>> | null = null;
    await session.withTransaction(async () => {
      result = await execute(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

export async function createHandoverDeadlineRefund(input: {
  orderId: mongoose.Types.ObjectId;
  session: ClientSession;
}) {
  await touchSettlementOrderFence(input.orderId, input.session);
  const order = await Order.findById(input.orderId).session(input.session);
  if (!order || order.status !== "CANCELLED") throw new Error("Cancelled order is required for deadline refund.");
  const existing = await BuyerRefundEntitlement.findOne({ orderId: order._id }).session(input.session);
  if (existing) {
    if (!existing.buyerId.equals(order.buyerId) || existing.productAmount !== order.subtotal || !existing.refundId) {
      throw new Error("Existing buyer refund entitlement requires review.");
    }
    const previous = await Refund.findById(existing.refundId).session(input.session);
    if (!previous) throw new Error("Existing buyer refund record is missing.");
    return previous;
  }
  const [refund] = await Refund.create([{
    orderId: order._id,
    userId: order.buyerId,
    reason: "SELLER_CANCELLED",
    description: "Seller handover deadline elapsed.",
    status: "PROCESSING",
    totalApprovedAmount: order.subtotal,
    auditLog: [{ status: "APPROVED", note: "Seller handover deadline elapsed.", at: new Date() }],
  }], { session: input.session });
  await recordBuyerRefund({ refund, order, session: input.session });
  const current = await Refund.findById(refund._id).session(input.session);
  if (!current) throw new Error("Deadline refund record is missing.");
  return current;
}

export function validReason(value: unknown): value is RefundReason {
  return (
    typeof value === "string" &&
    [
      "SELLER_CANCELLED",
      "QUALITY_INSPECTION_FAILED",
      "ITEM_LOST",
      "ITEM_DAMAGED",
      "ITEM_NOT_AS_DESCRIBED",
      "BUYER_CANCELLATION",
      "OTHER",
    ].includes(value)
  );
}
