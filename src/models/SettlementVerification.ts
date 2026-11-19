import mongoose, { Model, Schema } from "mongoose";
import { enforceAppendOnly } from "./append-only.ts";
import type { SettlementReviewReason, SettlementVerificationStatus } from "./LedgerEntryVerificationState.ts";

export type SettlementVerificationSubject = "LEDGER_ENTRY" | "PAYABLE_RECONCILIATION" | "RECOVERY";
export type SettlementVerificationAction =
  | "APPROVE"
  | "REJECT"
  | "REVOKE"
  | "INVALIDATE_DATA_CHANGED"
  | "FLAG_INTEGRITY_MISMATCH";

export interface ISettlementVerification {
  subjectType: SettlementVerificationSubject;
  subjectId: mongoose.Types.ObjectId;
  action: SettlementVerificationAction;
  previousStatus: SettlementVerificationStatus;
  resultingStatus: SettlementVerificationStatus;
  reviewReason?: SettlementReviewReason;
  dataRevision?: number;
  decisionRevision: number;
  snapshotVersion?: number;
  snapshotHash?: string;
  snapshotItemCount?: number;
  actorType: "ADMIN" | "SYSTEM";
  actorId?: mongoose.Types.ObjectId;
  reason: string;
  evidenceIds: mongoose.Types.ObjectId[];
  occurredAt: Date;
  idempotencyKey?: string;
  requestHash?: string;
}

const SettlementVerificationSchema = new Schema<ISettlementVerification>(
  {
    subjectType: {
      type: String,
      enum: ["LEDGER_ENTRY", "PAYABLE_RECONCILIATION", "RECOVERY"],
      required: true,
    },
    subjectId: { type: Schema.Types.ObjectId, required: true },
    action: {
      type: String,
      enum: ["APPROVE", "REJECT", "REVOKE", "INVALIDATE_DATA_CHANGED", "FLAG_INTEGRITY_MISMATCH"],
      required: true,
    },
    previousStatus: { type: String, enum: ["UNVERIFIED", "VERIFIED", "REQUIRES_REVIEW"], required: true },
    resultingStatus: { type: String, enum: ["UNVERIFIED", "VERIFIED", "REQUIRES_REVIEW"], required: true },
    reviewReason: { type: String, enum: ["REJECTED", "REVOKED", "DATA_CHANGED", "INTEGRITY_MISMATCH"] },
    dataRevision: { type: Number, min: 0, validate: Number.isSafeInteger },
    decisionRevision: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    snapshotVersion: { type: Number, min: 1, validate: Number.isSafeInteger },
    snapshotHash: { type: String, match: /^[a-f\d]{64}$/ },
    snapshotItemCount: { type: Number, min: 1, validate: Number.isSafeInteger },
    actorType: { type: String, enum: ["ADMIN", "SYSTEM"], required: true },
    actorId: { type: Schema.Types.ObjectId, ref: "User" },
    reason: { type: String, required: true, trim: true, maxlength: 1000 },
    evidenceIds: [{ type: Schema.Types.ObjectId, ref: "SettlementEvidence" }],
    occurredAt: { type: Date, required: true },
    idempotencyKey: { type: String, trim: true, minlength: 8, maxlength: 200 },
    requestHash: { type: String, match: /^[a-f\d]{64}$/ },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
SettlementVerificationSchema.pre("validate", function () {
  const isDecision = ["APPROVE", "REJECT", "REVOKE"].includes(this.action);
  if (this.actorType === "ADMIN" && !this.actorId) {
    this.invalidate("actorId", "An ADMIN event requires an actor.");
  }
  if (isDecision && (
    this.actorType !== "ADMIN" || !this.actorId || !this.idempotencyKey ||
    !this.requestHash || !this.snapshotVersion || !this.snapshotHash || !this.snapshotItemCount
  )) {
    this.invalidate("action", "A verification decision requires an ADMIN, idempotency, and a complete snapshot.");
  }
  if (isDecision && this.subjectType !== "LEDGER_ENTRY" && this.dataRevision === undefined) {
    this.invalidate("dataRevision", "A financial subject decision requires a data revision.");
  }
  if (this.resultingStatus === "REQUIRES_REVIEW" && !this.reviewReason) {
    this.invalidate("reviewReason", "A review reason is required.");
  }
  const validTransition =
    (this.action === "APPROVE" &&
      ["UNVERIFIED", "REQUIRES_REVIEW"].includes(this.previousStatus) &&
      this.resultingStatus === "VERIFIED" && !this.reviewReason) ||
    (this.action === "REJECT" &&
      ["UNVERIFIED", "REQUIRES_REVIEW"].includes(this.previousStatus) &&
      this.resultingStatus === "REQUIRES_REVIEW" && this.reviewReason === "REJECTED") ||
    (this.action === "REVOKE" && this.previousStatus === "VERIFIED" &&
      this.resultingStatus === "REQUIRES_REVIEW" && this.reviewReason === "REVOKED") ||
    (this.action === "INVALIDATE_DATA_CHANGED" && this.previousStatus === "VERIFIED" &&
      this.resultingStatus === "REQUIRES_REVIEW" && this.reviewReason === "DATA_CHANGED") ||
    (this.action === "FLAG_INTEGRITY_MISMATCH" &&
      this.resultingStatus === "REQUIRES_REVIEW" && this.reviewReason === "INTEGRITY_MISMATCH");
  if (!validTransition) {
    this.invalidate("action", "Invalid verification status transition.");
  }
});
enforceAppendOnly(SettlementVerificationSchema, "Settlement verification event");
SettlementVerificationSchema.index({ subjectType: 1, subjectId: 1, occurredAt: -1, _id: -1 });
SettlementVerificationSchema.index(
  { subjectType: 1, subjectId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } } },
);

const SettlementVerification: Model<ISettlementVerification> =
  mongoose.models.SettlementVerification ||
  mongoose.model<ISettlementVerification>("SettlementVerification", SettlementVerificationSchema);

export default SettlementVerification;
