import mongoose from "mongoose";
import BuyerRefundEntitlement from "../models/BuyerRefundEntitlement.ts";
import SellerFinancialResolution from "../models/SellerFinancialResolution.ts";
import SellerFinancialResolutionItem from "../models/SellerFinancialResolutionItem.ts";
import SellerPayable from "../models/SellerPayable.ts";
import SellerRecovery from "../models/SellerRecovery.ts";
import { calculateSellerRecoveryAmount } from "./seller-settlement-calculations.ts";
import { inspectPayableFinancialIntegrity, hasActiveSettlementHold } from "./settlement-financial-guard.ts";
import { createSettlementFinancialHold } from "./settlement-holds.ts";
import { recordSettlementMutation } from "./settlement-mutation.ts";
import { touchSettlementOrderFence } from "./settlement-order-fence.ts";

const MAX_FAILED_ATTEMPTS = 5;

export async function processSellerFinancialResolution(resolutionId: mongoose.Types.ObjectId) {
  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(async () => {
      const initial = await SellerFinancialResolution.findById(resolutionId).select("orderId").session(session).lean();
      if (!initial) throw new Error("Seller financial resolution not found.");
      await touchSettlementOrderFence(initial.orderId, session);
      const resolution = await SellerFinancialResolution.findById(resolutionId).session(session);
      if (!resolution || !resolution.orderId.equals(initial.orderId)) throw new Error("Seller financial resolution changed.");
      if (resolution.status !== "PENDING") return resolution.status;
      if (resolution.nextAttemptAt && resolution.nextAttemptAt > new Date()) return resolution.status;
      const entitlement = await BuyerRefundEntitlement.findById(resolution.entitlementId).session(session).lean();
      if (!entitlement || !entitlement.orderId.equals(resolution.orderId) || !entitlement.refundId) {
        throw new Error("Seller resolution refund entitlement is missing or inconsistent.");
      }

      const payables = await SellerPayable.find({ orderId: resolution.orderId }).session(session);
      let held = false;
      for (const payable of payables) {
        const filter = { resolutionId: resolution._id, payableId: payable._id };
        const item = await SellerFinancialResolutionItem.findOne(filter).session(session);
        if (item?.status === "RESOLVED") continue;
        const activeHold = await hasActiveSettlementHold(payable._id, undefined, session);
        let issue = activeHold ? null : await inspectPayableFinancialIntegrity(payable._id, session);
        const existingRecovery = await SellerRecovery.exists({ payableId: payable._id }).session(session);
        if (!activeHold && !issue && (payable.status === "CANCELLED" || existingRecovery)) {
          issue = {
            reason: "UNRESOLVED_AMOUNT_PROVENANCE",
            description: "An existing cancellation or recovery requires financial review.",
          };
        }
        if (activeHold || issue) {
          held = true;
          if (issue) {
            await createSettlementFinancialHold({
              holdId: new mongoose.Types.ObjectId(),
              orderId: resolution.orderId,
              subjectType: "PAYABLE",
              subjectId: payable._id,
              reason: issue.reason,
              description: issue.description,
              actor: { type: "SYSTEM" },
              session,
            });
          }
          if (item?.status !== "ON_HOLD") {
            await SellerFinancialResolutionItem.updateOne(filter, {
              $set: { status: "ON_HOLD" },
              $setOnInsert: filter,
              $inc: { revision: 1 },
            }, { upsert: true, session, setDefaultsOnInsert: false });
          }
          continue;
        }
        if (payable.totalPaid === undefined || payable.overpaymentReturned === undefined) {
          throw new Error("Seller payment provenance changed during resolution.");
        }
        const retained = calculateSellerRecoveryAmount({
          totalPaid: payable.totalPaid,
          overpaymentReturned: payable.overpaymentReturned,
        });
        payable.status = "CANCELLED";
        payable.cancelledAt = new Date();
        await payable.save({ session });
        let recoveryId: mongoose.Types.ObjectId | undefined;
        if (retained > 0) {
          const [recovery] = await SellerRecovery.create([{
            orderId: resolution.orderId,
            refundId: entitlement.refundId,
            payableId: payable._id,
            sellerId: payable.sellerId,
            settledAmount: retained,
            amountDue: retained,
            amountRecovered: 0,
            status: "OUTSTANDING",
            entries: [],
          }], { session });
          recoveryId = recovery._id;
        }
        await recordSettlementMutation({
          session,
          payableIds: [payable._id],
          recoveryIds: recoveryId ? [recoveryId] : [],
          reason: "Seller financial resolution prepared after buyer refund.",
        });
        await SellerFinancialResolutionItem.updateOne(filter, {
          $set: { status: "RESOLVED" },
          $setOnInsert: filter,
          $inc: { revision: 1 },
        }, { upsert: true, session, setDefaultsOnInsert: false });
      }
      const status = held ? "ON_HOLD" : "RESOLVED";
      resolution.status = status;
      resolution.revision += 1;
      await resolution.save({ session });
      return resolution.status;
    });
  } finally {
    await session.endSession();
  }
}

export async function recordSellerResolutionFailure(resolutionId: mongoose.Types.ObjectId) {
    const session = await mongoose.startSession();
    try {
      return await session.withTransaction(async () => {
        const initial = await SellerFinancialResolution.findById(resolutionId).select("orderId").session(session).lean();
        if (!initial) throw new Error("Seller financial resolution not found.");
        await touchSettlementOrderFence(initial.orderId, session);
        const resolution = await SellerFinancialResolution.findById(resolutionId).session(session);
        if (!resolution || !resolution.orderId.equals(initial.orderId)) throw new Error("Seller financial resolution changed.");
        if (resolution.status !== "PENDING" || (resolution.nextAttemptAt && resolution.nextAttemptAt > new Date())) {
          return resolution.status;
        }
        const attempts = resolution.failedAttempts + 1;
        if (!Number.isSafeInteger(attempts)) throw new Error("Seller resolution retry count is invalid.");
        const now = new Date();
        resolution.failedAttempts = attempts;
        resolution.lastFailureAt = now;
        if (attempts >= MAX_FAILED_ATTEMPTS) {
          resolution.status = "FAILED_REQUIRES_ATTENTION";
          resolution.nextAttemptAt = undefined;
        } else {
          resolution.nextAttemptAt = new Date(now.getTime() + 60_000 * 2 ** (attempts - 1));
        }
        resolution.revision += 1;
        await resolution.save({ session });
        return resolution.status;
      });
    } finally {
      await session.endSession();
  }
}
