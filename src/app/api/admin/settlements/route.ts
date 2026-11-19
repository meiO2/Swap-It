import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { requireRole } from "@/lib/authorization";
import { isUploadedImageUrl } from "@/lib/image-urls";
import { connectDB } from "@/lib/mongodb";
import { calculateSellerSettlement } from "@/lib/seller-settlement-calculations";
import SellerPayable, {
  type SellerPayableStatus,
} from "@/models/SellerPayable";
import SellerRecovery, {
  type SellerRecoveryStatus,
} from "@/models/SellerRecovery";
import SellerSettlementLedger from "@/models/SellerSettlementLedger";
import SettlementFinancialHold from "@/models/SettlementFinancialHold";
import BuyerRefundEntitlement from "@/models/BuyerRefundEntitlement";
import Order from "@/models/Order";
import Refund from "@/models/Refund";
import { touchSettlementOrderFence } from "@/lib/settlement-order-fence";
import { recordSettlementMutation } from "@/lib/settlement-mutation";
import { createSettlementFinancialHold } from "@/lib/settlement-holds";
import {
  hasActiveSettlementHold,
  inspectPayableFinancialIntegrity,
  inspectRecoveryFinancialIntegrity,
} from "@/lib/settlement-financial-guard";
import User from "@/models/User";

const PAYABLE_STATUSES = [
  "PENDING",
  "PARTIALLY_SETTLED",
  "OVERPAID",
  "SETTLED",
  "CANCELLED",
] as const satisfies readonly SellerPayableStatus[];
const RECOVERY_STATUSES = [
  "OUTSTANDING",
  "RECOVERED",
] as const satisfies readonly SellerRecoveryStatus[];
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

function parsePositiveInteger(value: string | null, fallback: number) {
  if (value === null) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function isPayableStatus(value: string): value is SellerPayableStatus {
  return PAYABLE_STATUSES.includes(value as SellerPayableStatus);
}

function isRecoveryStatus(value: string): value is SellerRecoveryStatus {
  return RECOVERY_STATUSES.includes(value as SellerRecoveryStatus);
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getPagination(requestedPage: number, pageSize: number, total: number) {
  const totalPages = Math.ceil(total / pageSize);
  return {
    page: totalPages === 0 ? 1 : Math.min(requestedPage, totalPages),
    pageSize,
    total,
    totalPages,
  };
}

class SettlementWorkflowError extends Error {
  readonly status: 400 | 404 | 409;

  constructor(
    message: string,
    status: 400 | 404 | 409,
  ) {
    super(message);
    this.status = status;
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireRole(["ADMIN"]);
    if (!auth.success) return auth.response;

    const { searchParams } = new URL(request.url);
    const requestedPayablesPage = parsePositiveInteger(
      searchParams.get("payablesPage"),
      1,
    );
    const requestedRecoveriesPage = parsePositiveInteger(
      searchParams.get("recoveriesPage"),
      1,
    );
    const pageSize = parsePositiveInteger(
      searchParams.get("pageSize"),
      DEFAULT_PAGE_SIZE,
    );
    const payableStatusValue = searchParams.get("payablesStatus");
    const recoveryStatusValue = searchParams.get("recoveriesStatus");
    const search = searchParams.get("search")?.trim() ?? "";

    if (
      requestedPayablesPage === null ||
      requestedRecoveriesPage === null ||
      pageSize === null ||
      pageSize > MAX_PAGE_SIZE ||
      (payableStatusValue !== null &&
        payableStatusValue !== "" &&
        !isPayableStatus(payableStatusValue)) ||
      (recoveryStatusValue !== null &&
        recoveryStatusValue !== "" &&
        !isRecoveryStatus(recoveryStatusValue)) ||
      search.length > 100
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid settlement pagination or filters." },
        { status: 400 },
      );
    }

    await connectDB();

    const payableStatus = payableStatusValue || undefined;
    const recoveryStatus = recoveryStatusValue || undefined;
    const sellerIds = search
      ? await User.find({
          $or: [
            { name: { $regex: escapeRegex(search), $options: "i" } },
            { email: { $regex: escapeRegex(search), $options: "i" } },
          ],
        })
          .select("_id")
          .lean()
          .then((sellers) => sellers.map((seller) => seller._id))
      : [];
    const searchId = /^[a-f\d]{24}$/i.test(search)
      ? new mongoose.Types.ObjectId(search)
      : undefined;
    const payableFilter: Record<string, unknown> = {};
    const recoveryFilter: Record<string, unknown> = {};

    if (payableStatus) payableFilter.status = payableStatus;
    if (recoveryStatus) recoveryFilter.status = recoveryStatus;
    if (search) {
      payableFilter.$or = [
        { sellerId: { $in: sellerIds } },
        ...(searchId ? [{ _id: searchId }, { orderId: searchId }] : []),
      ];
      recoveryFilter.$or = [
        { sellerId: { $in: sellerIds } },
        ...(searchId
          ? [
              { _id: searchId },
              { orderId: searchId },
              { refundId: searchId },
            ]
          : []),
      ];
    }

    const [payableTotal, recoveryTotal] = await Promise.all([
      SellerPayable.countDocuments(payableFilter),
      SellerRecovery.countDocuments(recoveryFilter),
    ]);
    const payablesPagination = getPagination(
      requestedPayablesPage,
      pageSize,
      payableTotal,
    );
    const recoveriesPagination = getPagination(
      requestedRecoveriesPage,
      pageSize,
      recoveryTotal,
    );
    const [payables, recoveries] = await Promise.all([
      SellerPayable.find(payableFilter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((payablesPagination.page - 1) * pageSize)
        .limit(pageSize)
        .populate("sellerId", "name email")
        .populate("orderId", "status createdAt")
        .lean(),
      SellerRecovery.find(recoveryFilter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((recoveriesPagination.page - 1) * pageSize)
        .limit(pageSize)
        .populate("sellerId", "name email")
        .populate("orderId", "status createdAt")
        .populate("refundId", "status reason")
        .lean(),
    ]);
    const payableIds = payables.map((payable) => payable._id);
    const recoveryIds = recoveries.map((recovery) => recovery._id);
    const ledger = await SellerSettlementLedger.find({
      $or: [
        { sellerPayableId: { $in: payableIds } },
        { sellerRecoveryId: { $in: recoveryIds } },
      ],
    })
      .sort({ occurredAt: -1, _id: -1 })
      .populate("sellerId", "name email")
      .populate("recordedBy", "name email")
      .lean();
    const normalizedPayables = payables.map((payable) => {
      const totalPaid = payable.totalPaid ?? null;
      const overpaymentReturned = payable.overpaymentReturned ?? null;
      let settlement: ReturnType<typeof calculateSellerSettlement> | null = null;
      if (payable.ledgerBaseline === "ZERO_AT_CREATION" && totalPaid !== null && overpaymentReturned !== null) {
        try {
          settlement = calculateSellerSettlement({ payableAmount: payable.payableAmount, totalPaid, overpaymentReturned });
        } catch (error) {
          if (!(error instanceof RangeError)) throw error;
        }
      }
      return {
        ...payable,
        ...settlement,
        totalPaid,
        overpaymentReturned,
        outstandingPayable: settlement?.outstandingPayable ?? null,
        overpaymentAmount: settlement?.overpaymentAmount ?? null,
        outstandingOverpayment: settlement?.outstandingOverpayment ?? null,
        financialProvenance: settlement ? "BASELINE_RECORDED" : "REQUIRES_REVIEW",
        status: payable.status,
      };
    });
    return NextResponse.json({
      success: true,
      data: {
        payables: normalizedPayables,
        recoveries,
        ledger,
        pagination: {
          payables: payablesPagination,
          recoveries: recoveriesPagination,
        },
      },
    });
  } catch (error) {
    console.error("Get seller settlement records error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to retrieve settlement records." },
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
    const action = input.action;
    const id = input.id;
    const amount = input.amount;
    const idempotencyKey = input.idempotencyKey;
    const reasonValue = input.reason;
    const occurredAtValue = input.occurredAt;
    const referenceValue = input.reference;
    const evidenceValue = input.evidenceUrl;
    const reference =
      typeof referenceValue === "string" ? referenceValue.trim() : "";
    const reason =
      typeof reasonValue === "string" ? reasonValue.trim() : "";
    const evidenceUrl =
      typeof evidenceValue === "string" ? evidenceValue.trim() : "";
    if (
      (action !== "PAYMENT" &&
        action !== "OVERPAYMENT_RETURN" &&
        action !== "RECOVER") ||
      typeof id !== "string" ||
      !mongoose.isValidObjectId(id) ||
      typeof amount !== "number" ||
      !Number.isSafeInteger(amount) ||
      amount <= 0 ||
      typeof idempotencyKey !== "string" ||
      idempotencyKey.trim().length < 8 ||
      idempotencyKey.length > 200 ||
      typeof reasonValue !== "string" ||
      !reason ||
      reason.length > 1000 ||
      typeof occurredAtValue !== "string" ||
      reference.length > 200 ||
      (input.evidenceUrl !== undefined &&
        (typeof evidenceValue !== "string" ||
          !evidenceUrl ||
          evidenceUrl.length > 2048 ||
          !isUploadedImageUrl(evidenceUrl)))
    ) {
      return NextResponse.json(
        { success: false, message: "A valid action, amount, date, reason, and record ID are required." },
        { status: 400 },
      );
    }
    const occurredAt = new Date(occurredAtValue);
    if (Number.isNaN(occurredAt.getTime())) {
      return NextResponse.json(
        { success: false, message: "A valid transaction date is required." },
        { status: 400 },
      );
    }
    const entryType =
      action === "PAYMENT"
        ? "SELLER_PAYMENT"
        : action === "OVERPAYMENT_RETURN"
          ? "OVERPAYMENT_RETURN"
          : "REFUND_RECOVERY";

    const session = await mongoose.startSession();
    let result: unknown;
    let blockedMessage: string | undefined;
    try {
      await session.withTransaction(async () => {
        blockedMessage = undefined;
        const existingEntry = await SellerSettlementLedger.findOne({
          idempotencyKey,
        }).session(session);
        if (existingEntry) {
          const targetId =
            existingEntry.entryType === "REFUND_RECOVERY"
              ? existingEntry.sellerRecoveryId?.toString()
              : existingEntry.sellerPayableId.toString();
          if (
            existingEntry.entryType !== entryType ||
            targetId !== id ||
            existingEntry.amount !== amount ||
            existingEntry.reason !== reason ||
            existingEntry.occurredAt.getTime() !== occurredAt.getTime() ||
            (existingEntry.reference ?? "") !== reference ||
            (existingEntry.evidenceUrl ?? "") !== evidenceUrl
          ) {
            throw new SettlementWorkflowError(
              "This idempotency key was already used for a different settlement entry.",
              409,
            );
          }
          result = existingEntry;
          return;
        }

        const target = action === "RECOVER"
          ? await SellerRecovery.findById(id).select("orderId payableId").session(session).lean()
          : await SellerPayable.findById(id).select("orderId").session(session).lean();
        if (!target) throw new SettlementWorkflowError("Settlement record not found.", 404);
        await touchSettlementOrderFence(target.orderId, session);
        const guardedRecovery = action === "RECOVER"
          ? await SellerRecovery.findById(id).session(session).lean()
          : null;
        const payableId = action === "RECOVER" ? guardedRecovery?.payableId : new mongoose.Types.ObjectId(id);
        if (!payableId || (guardedRecovery && !guardedRecovery.orderId.equals(target.orderId))) {
          throw new SettlementWorkflowError("Settlement record changed before processing.", 409);
        }
        if (await hasActiveSettlementHold(payableId, guardedRecovery?._id, session)) {
          throw new SettlementWorkflowError("An active financial hold blocks this settlement action.", 409);
        }
        if (action === "PAYMENT") {
          const order = await Order.findById(target.orderId).select("status").session(session).lean();
          const refund = await Refund.exists({
            orderId: target.orderId,
            status: { $in: ["APPROVED", "PROCESSING", "PARTIALLY_COMPLETED", "COMPLETED"] },
          }).session(session);
          const entitlement = await BuyerRefundEntitlement.exists({ orderId: target.orderId }).session(session);
          if (!order || ["CANCELLED", "REFUNDED", "EXPIRED"].includes(order.status) || refund || entitlement) {
            throw new SettlementWorkflowError("Seller payment is blocked while refund resolution is in progress.", 409);
          }
        }
        const payableIssue = await inspectPayableFinancialIntegrity(payableId, session);
        const recoveryIssue = !payableIssue && guardedRecovery
          ? await inspectRecoveryFinancialIntegrity(guardedRecovery._id, payableId, session)
          : null;
        const issue = payableIssue ?? recoveryIssue;
        if (issue) {
          const subjectType = payableIssue ? "PAYABLE" : "RECOVERY";
          const subjectId = payableIssue ? payableId : guardedRecovery!._id;
          const existingHold = await SettlementFinancialHold.exists({
            subjectType, subjectId, status: "ACTIVE", reason: issue.reason,
          }).session(session);
          if (!existingHold) {
            await createSettlementFinancialHold({
              holdId: new mongoose.Types.ObjectId(),
              orderId: target.orderId,
              subjectType,
              subjectId,
              reason: issue.reason,
              description: issue.description,
              actor: { type: "SYSTEM" },
              session,
            });
          }
          blockedMessage = issue.description;
          return;
        }

        if (action === "PAYMENT") {
          if (input.confirmedPaid !== true) {
            throw new SettlementWorkflowError(
              "Confirm that the seller transfer has actually been made.",
              409,
            );
          }
          const payable = await SellerPayable.findById(id).session(session);
          if (
            !payable ||
            !["PENDING", "PARTIALLY_SETTLED"].includes(payable.status)
          ) {
            throw new SettlementWorkflowError(
              "This seller payable cannot accept another payment.",
              payable ? 409 : 404,
            );
          }
          if (payable.totalPaid === undefined || payable.overpaymentReturned === undefined) {
            throw new SettlementWorkflowError("Payment provenance requires review.", 409);
          }
          const totalPaid = payable.totalPaid + amount;
          if (!Number.isSafeInteger(totalPaid)) throw new SettlementWorkflowError("Payment amount exceeds the supported range.", 409);
          const overpaymentReturned = payable.overpaymentReturned;
          const settlement = calculateSellerSettlement({
            payableAmount: payable.payableAmount,
            totalPaid,
            overpaymentReturned,
          });
          const recordedAt = new Date();
          const updated = await SellerPayable.findOneAndUpdate(
            { _id: payable._id, status: payable.status },
            {
              $set: {
                status: settlement.status,
                totalPaid,
                overpaymentReturned,
                ...(settlement.status === "SETTLED"
                  ? {
                      settledBy: new mongoose.Types.ObjectId(auth.user.id),
                      settledAt: recordedAt,
                    }
                  : {}),
                settlementReference: reference || undefined,
              },
            },
            { new: true, session },
          );
          if (!updated) {
            throw new SettlementWorkflowError(
              "Seller payable changed before payment was recorded.",
              409,
            );
          }
          const [entry] = await SellerSettlementLedger.create(
            [
              {
                sellerPayableId: payable._id,
                orderId: payable.orderId,
                sellerId: payable.sellerId,
                entryType,
                amount,
                reason,
                occurredAt,
                recordedAt,
                recordedBy: new mongoose.Types.ObjectId(auth.user.id),
                idempotencyKey,
                reference: reference || undefined,
                evidenceUrl: evidenceUrl || undefined,
              },
            ],
            { session },
          );
          await recordSettlementMutation({ session, payableIds: [payable._id], reason: "Seller payment recorded." });
          result = { payable: await SellerPayable.findById(updated._id).session(session), ledgerEntry: entry };
          return;
        }

        if (input.confirmedReceived !== true) {
          throw new SettlementWorkflowError(
            "Confirm that the funds have actually been received.",
            409,
          );
        }
        const recordedAt = new Date();
        if (action === "OVERPAYMENT_RETURN") {
          const payable = await SellerPayable.findById(id).session(session);
          if (!payable || payable.status !== "OVERPAID") {
            throw new SettlementWorkflowError(
              "This seller payable has no outstanding overpayment.",
              payable ? 409 : 404,
            );
          }
          if (payable.totalPaid === undefined || payable.overpaymentReturned === undefined) {
            throw new SettlementWorkflowError("Payment provenance requires review.", 409);
          }
          const totalPaid = payable.totalPaid;
          const currentOverpaymentReturned = payable.overpaymentReturned;
          const currentSettlement = calculateSellerSettlement({
            payableAmount: payable.payableAmount,
            totalPaid,
            overpaymentReturned: currentOverpaymentReturned,
          });
          if (amount > currentSettlement.outstandingOverpayment) {
            throw new SettlementWorkflowError(
              "Overpayment return exceeds the outstanding overpayment.",
              409,
            );
          }
          const overpaymentReturned =
            currentOverpaymentReturned + amount;
          const settlement = calculateSellerSettlement({
            payableAmount: payable.payableAmount,
            totalPaid,
            overpaymentReturned,
          });
          const updated = await SellerPayable.findOneAndUpdate(
            { _id: payable._id, status: "OVERPAID" },
            {
              $set: {
                status: settlement.status,
                totalPaid,
                overpaymentReturned,
                ...(settlement.status === "SETTLED"
                  ? {
                      settledBy: new mongoose.Types.ObjectId(auth.user.id),
                      settledAt: recordedAt,
                    }
                  : {}),
              },
            },
            { new: true, session },
          );
          if (!updated) {
            throw new SettlementWorkflowError(
              "Seller payable changed before the overpayment return was recorded.",
              409,
            );
          }
          const [entry] = await SellerSettlementLedger.create(
            [
              {
                sellerPayableId: payable._id,
                orderId: payable.orderId,
                sellerId: payable.sellerId,
                entryType,
                amount,
                reason,
                occurredAt,
                recordedAt,
                recordedBy: new mongoose.Types.ObjectId(auth.user.id),
                idempotencyKey,
                reference: reference || undefined,
                evidenceUrl: evidenceUrl || undefined,
              },
            ],
            { session },
          );
          await recordSettlementMutation({ session, payableIds: [payable._id], reason: "Seller overpayment returned." });
          result = { payable: await SellerPayable.findById(updated._id).session(session), ledgerEntry: entry };
          return;
        }

        const recovery = await SellerRecovery.findOne({
          _id: id,
          status: "OUTSTANDING",
        }).session(session);
        if (!recovery) {
          throw new SettlementWorkflowError(
            "Outstanding seller recovery not found.",
            404,
          );
        }
        const outstanding = recovery.amountDue - recovery.amountRecovered;
        if (amount > outstanding) {
          throw new SettlementWorkflowError(
            `Recovery amount exceeds the outstanding ${outstanding} Rp.`,
            409,
          );
        }
        const recoveredTotal = recovery.amountRecovered + amount;
        const updated = await SellerRecovery.findOneAndUpdate(
          {
            _id: recovery._id,
            status: "OUTSTANDING",
            amountRecovered: recovery.amountRecovered,
          },
          {
            $inc: { amountRecovered: amount },
            $set: {
              status: recoveredTotal === recovery.amountDue ? "RECOVERED" : "OUTSTANDING",
            },
            $push: {
              entries: {
                amount,
                reason,
                recordedBy: new mongoose.Types.ObjectId(auth.user.id),
                reference: reference || undefined,
                note: reason,
                evidenceUrl: evidenceUrl || undefined,
                occurredAt,
                recordedAt,
              },
            },
          },
          { new: true, session },
        );
        if (!updated) {
          throw new SettlementWorkflowError(
            "Seller recovery changed before this payment was recorded.",
            409,
          );
        }
        const [entry] = await SellerSettlementLedger.create(
          [
            {
              sellerPayableId: recovery.payableId,
              sellerRecoveryId: recovery._id,
              orderId: recovery.orderId,
              sellerId: recovery.sellerId,
              entryType,
              amount,
              reason,
              occurredAt,
              recordedAt,
              recordedBy: new mongoose.Types.ObjectId(auth.user.id),
              idempotencyKey,
              reference: reference || undefined,
              evidenceUrl: evidenceUrl || undefined,
            },
          ],
          { session },
        );
        await recordSettlementMutation({
          session,
          payableIds: [recovery.payableId],
          recoveryIds: [recovery._id],
          reason: "Seller recovery recorded.",
        });
        result = { recovery: await SellerRecovery.findById(updated._id).session(session), ledgerEntry: entry };
      });
    } finally {
      await session.endSession();
    }

    if (blockedMessage) {
      return NextResponse.json({ success: false, message: blockedMessage }, { status: 409 });
    }
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update settlement records.";
    const status =
      error instanceof SettlementWorkflowError ? error.status : 500;
    if (status === 500) console.error("Update seller settlement record error:", error);
    return NextResponse.json({ success: false, message }, { status });
  }
}
