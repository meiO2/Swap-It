import mongoose, { type ClientSession } from "mongoose";
import SellerPayable from "../models/SellerPayable.ts";
import SellerRecovery from "../models/SellerRecovery.ts";
import SettlementVerification from "../models/SettlementVerification.ts";
import type { SettlementVerificationSummary } from "../models/settlement-verification-summary.ts";

function readSummary(value: unknown): SettlementVerificationSummary {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Malformed settlement verification metadata.");
  }
  const state = value as Record<string, unknown>;
  if (
    !["UNVERIFIED", "VERIFIED", "REQUIRES_REVIEW"].includes(String(state.status)) ||
    !Number.isSafeInteger(state.dataRevision) || Number(state.dataRevision) < 0 ||
    !Number.isSafeInteger(state.decisionRevision) || Number(state.decisionRevision) < 0 ||
    (state.lastEventId !== undefined && !(state.lastEventId instanceof mongoose.Types.ObjectId)) ||
    (state.verifiedDataRevision !== undefined &&
      (!Number.isSafeInteger(state.verifiedDataRevision) ||
        Number(state.verifiedDataRevision) < 0 ||
        Number(state.verifiedDataRevision) > Number(state.dataRevision))) ||
    (state.verifiedSnapshotHash !== undefined &&
      (typeof state.verifiedSnapshotHash !== "string" || !/^[a-f\d]{64}$/.test(state.verifiedSnapshotHash))) ||
    ((state.verifiedDataRevision === undefined) !== (state.verifiedSnapshotHash === undefined)) ||
    (state.status !== "REQUIRES_REVIEW" && state.reviewReason !== undefined)
  ) {
    throw new Error("Malformed settlement verification metadata.");
  }
  if (
    state.status === "VERIFIED" &&
    (state.verifiedDataRevision !== state.dataRevision ||
      typeof state.verifiedSnapshotHash !== "string" ||
      !/^[a-f\d]{64}$/.test(state.verifiedSnapshotHash) ||
      !(state.lastEventId instanceof mongoose.Types.ObjectId))
  ) {
    throw new Error("Malformed verified settlement metadata.");
  }
  if (
    state.status === "REQUIRES_REVIEW" &&
    !["REJECTED", "REVOKED", "DATA_CHANGED", "INTEGRITY_MISMATCH"].includes(String(state.reviewReason))
  ) {
    throw new Error("Malformed settlement review reason.");
  }
  return value as SettlementVerificationSummary;
}

export async function recordSettlementMutation(input: {
  session: ClientSession;
  payableIds?: mongoose.Types.ObjectId[];
  recoveryIds?: mongoose.Types.ObjectId[];
  reason: string;
}) {
  if (!input.session.inTransaction()) {
    throw new Error("Settlement mutation requires an active transaction.");
  }
  const reason = input.reason.trim();
  if (!reason || reason.length > 1000) throw new Error("A settlement mutation reason is required.");
  const subjects = [
    ...(input.payableIds ?? []).map((id) => ({ id, type: "PAYABLE_RECONCILIATION" as const })),
    ...(input.recoveryIds ?? []).map((id) => ({ id, type: "RECOVERY" as const })),
  ];
  const seen = new Set<string>();
  for (const subject of subjects) {
    if (!(subject.id instanceof mongoose.Types.ObjectId)) throw new Error("Invalid settlement subject ID.");
    const key = `${subject.type}:${subject.id.toHexString()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const collection = subject.type === "RECOVERY" ? SellerRecovery.collection : SellerPayable.collection;
    const document = await collection.findOne({ _id: subject.id }, { session: input.session });
    if (!document) throw new Error("Settlement subject not found.");
    const exists = Object.prototype.hasOwnProperty.call(document, "verification");
    const previous = exists
      ? readSummary(document.verification)
      : { status: "UNVERIFIED" as const, dataRevision: 0, decisionRevision: 0 };
    if (!Number.isSafeInteger(previous.dataRevision + 1) ||
      (previous.status === "VERIFIED" && !Number.isSafeInteger(previous.decisionRevision + 1))) {
      throw new Error("Settlement revision exhausted.");
    }

    const next: SettlementVerificationSummary = {
      ...previous,
      dataRevision: previous.dataRevision + 1,
    };
    let eventId: mongoose.Types.ObjectId | undefined;
    if (previous.status === "VERIFIED") {
      eventId = new mongoose.Types.ObjectId();
      next.status = "REQUIRES_REVIEW";
      next.reviewReason = "DATA_CHANGED";
      next.decisionRevision += 1;
      next.lastEventId = eventId;
    }
    const filter = exists
      ? {
          _id: subject.id,
          "verification.status": previous.status,
          "verification.dataRevision": previous.dataRevision,
          "verification.decisionRevision": previous.decisionRevision,
        }
      : { _id: subject.id, verification: { $exists: false } };
    const result = await collection.updateOne(filter, { $set: { verification: next } }, { session: input.session });
    if (result.matchedCount !== 1) throw new Error("Settlement verification metadata changed concurrently.");

    if (eventId) {
      await SettlementVerification.create([{
        _id: eventId,
        subjectType: subject.type,
        subjectId: subject.id,
        action: "INVALIDATE_DATA_CHANGED",
        previousStatus: "VERIFIED",
        resultingStatus: "REQUIRES_REVIEW",
        reviewReason: "DATA_CHANGED",
        dataRevision: next.dataRevision,
        decisionRevision: next.decisionRevision,
        actorType: "SYSTEM",
        reason,
        occurredAt: new Date(),
      }], { session: input.session });
    }
  }
}
