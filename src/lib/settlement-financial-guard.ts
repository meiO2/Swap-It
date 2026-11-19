import mongoose, { type ClientSession } from "mongoose";
import SellerPayable from "../models/SellerPayable.ts";
import SellerRecovery from "../models/SellerRecovery.ts";
import SellerSettlementLedger from "../models/SellerSettlementLedger.ts";
import SettlementFinancialHold from "../models/SettlementFinancialHold.ts";
import type { SettlementHoldReason } from "./settlement-verification-policy.ts";
import { calculateSellerSettlement } from "./seller-settlement-calculations.ts";

type GuardIssue = { reason: SettlementHoldReason; description: string };

export async function inspectPayableFinancialIntegrity(
  payableId: mongoose.Types.ObjectId,
  session: ClientSession,
): Promise<GuardIssue | null> {
  if (!session.inTransaction()) throw new Error("Financial guard requires an active transaction.");
  const payable = await SellerPayable.findById(payableId).session(session).lean();
  if (!payable) throw new Error("Seller payable not found.");
  if (payable.ledgerBaseline !== "ZERO_AT_CREATION") {
    return {
      reason: "UNRESOLVED_AMOUNT_PROVENANCE",
      description: "The historical payment ledger baseline has not been established.",
    };
  }
  if (![payable.payableAmount, payable.totalPaid, payable.overpaymentReturned]
    .every((amount) => Number.isSafeInteger(amount) && Number(amount) >= 0)) {
    return {
      reason: "FINANCIAL_INVARIANT_FAILED",
      description: "The payable contains missing or invalid financial amounts.",
    };
  }
  const ledger = await SellerSettlementLedger.find({ sellerPayableId: payableId }).session(session).lean();
  const recoveries = await SellerRecovery.find({ payableId }).select("_id").session(session).lean();
  const recoveryIds = new Set(recoveries.map((recovery) => recovery._id.toString()));
  let paid = 0;
  let returned = 0;
  for (const entry of ledger) {
    if (!entry.orderId.equals(payable.orderId) || !entry.sellerId.equals(payable.sellerId) ||
      !Number.isSafeInteger(entry.amount) || entry.amount <= 0) {
      return { reason: "INTEGRITY_MISMATCH", description: "The settlement ledger does not match the payable." };
    }
    if ((entry.entryType === "REFUND_RECOVERY" &&
        (!entry.sellerRecoveryId || !recoveryIds.has(entry.sellerRecoveryId.toString()))) ||
      (entry.entryType !== "REFUND_RECOVERY" &&
        (entry.sellerRecoveryId || !["SELLER_PAYMENT", "OVERPAYMENT_RETURN"].includes(entry.entryType)))) {
      return { reason: "INTEGRITY_MISMATCH", description: "The settlement ledger contains an invalid recovery reference or entry type." };
    }
    if (entry.entryType === "SELLER_PAYMENT") paid += entry.amount;
    if (entry.entryType === "OVERPAYMENT_RETURN") returned += entry.amount;
    if (!Number.isSafeInteger(paid) || !Number.isSafeInteger(returned)) {
      return { reason: "FINANCIAL_INVARIANT_FAILED", description: "Settlement ledger totals exceed the safe integer range." };
    }
  }
  if (paid !== payable.totalPaid || returned !== payable.overpaymentReturned) {
    return { reason: "INTEGRITY_MISMATCH", description: "Payable amounts do not match recorded settlement ledger entries." };
  }
  try {
    const settlement = calculateSellerSettlement({
      payableAmount: payable.payableAmount,
      totalPaid: paid,
      overpaymentReturned: returned,
    });
    if (payable.status !== "CANCELLED" && payable.status !== settlement.status) {
      return { reason: "FINANCIAL_INVARIANT_FAILED", description: "The payable status does not match its financial amounts." };
    }
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return { reason: "FINANCIAL_INVARIANT_FAILED", description: "The payable financial amounts violate settlement invariants." };
  }
  return null;
}

export async function hasActiveSettlementHold(
  payableId: mongoose.Types.ObjectId,
  recoveryId: mongoose.Types.ObjectId | undefined,
  session: ClientSession,
) {
  if (!session.inTransaction()) throw new Error("Financial guard requires an active transaction.");
  return Boolean(await SettlementFinancialHold.exists({
    status: "ACTIVE",
    $or: [
      { subjectType: "PAYABLE" as const, subjectId: payableId },
      ...(recoveryId ? [{ subjectType: "RECOVERY" as const, subjectId: recoveryId }] : []),
    ],
  }).session(session));
}

export async function inspectRecoveryFinancialIntegrity(
  recoveryId: mongoose.Types.ObjectId,
  payableId: mongoose.Types.ObjectId,
  session: ClientSession,
): Promise<GuardIssue | null> {
  if (!session.inTransaction()) throw new Error("Financial guard requires an active transaction.");
  const recovery = await SellerRecovery.findById(recoveryId).session(session).lean();
  const payable = await SellerPayable.findById(payableId).session(session).lean();
  if (!recovery || !payable) throw new Error("Settlement subject not found.");
  if (!recovery.payableId.equals(payableId) ||
    !recovery.orderId.equals(payable.orderId) || !recovery.sellerId.equals(payable.sellerId)) {
    return { reason: "INTEGRITY_MISMATCH", description: "Recovery ownership does not match the payable." };
  }
  if (![recovery.settledAmount, recovery.amountDue, recovery.amountRecovered]
    .every((amount) => Number.isSafeInteger(amount) && amount >= 0) ||
    recovery.amountDue === 0 || recovery.amountRecovered > recovery.amountDue ||
    recovery.amountDue !== recovery.settledAmount ||
    (recovery.status === "RECOVERED") !== (recovery.amountRecovered === recovery.amountDue)) {
    return { reason: "FINANCIAL_INVARIANT_FAILED", description: "Recovery amounts or status violate settlement invariants." };
  }
  const ledger = await SellerSettlementLedger.find({ sellerRecoveryId: recoveryId }).session(session).lean();
  let ledgerTotal = 0;
  for (const entry of ledger) {
    if (entry.entryType !== "REFUND_RECOVERY" || !entry.sellerPayableId.equals(payableId) ||
      !entry.orderId.equals(recovery.orderId) || !entry.sellerId.equals(recovery.sellerId) ||
      !Number.isSafeInteger(entry.amount) || entry.amount <= 0) {
      return { reason: "INTEGRITY_MISMATCH", description: "Recovery ledger entries do not match the recovery." };
    }
    ledgerTotal += entry.amount;
    if (!Number.isSafeInteger(ledgerTotal)) {
      return { reason: "FINANCIAL_INVARIANT_FAILED", description: "Recovery ledger total exceeds the safe integer range." };
    }
  }
  let entryTotal = 0;
  for (const entry of recovery.entries) {
    if (!Number.isSafeInteger(entry.amount) || entry.amount <= 0) {
      return { reason: "INTEGRITY_MISMATCH", description: "Recovery entries contain invalid amounts." };
    }
    entryTotal += entry.amount;
    if (!Number.isSafeInteger(entryTotal)) {
      return { reason: "FINANCIAL_INVARIANT_FAILED", description: "Recovery entry total exceeds the safe integer range." };
    }
  }
  if (entryTotal !== recovery.amountRecovered || ledgerTotal !== recovery.amountRecovered) {
    return { reason: "INTEGRITY_MISMATCH", description: "Recovery amounts do not match recorded entries." };
  }
  return null;
}
