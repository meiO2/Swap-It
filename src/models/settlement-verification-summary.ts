import { Schema, Types } from "mongoose";
import type {
  SettlementReviewReason,
  SettlementVerificationStatus,
} from "./LedgerEntryVerificationState.ts";

export interface SettlementVerificationSummary {
  status: SettlementVerificationStatus;
  dataRevision: number;
  decisionRevision: number;
  lastEventId?: Types.ObjectId;
  verifiedDataRevision?: number;
  verifiedSnapshotHash?: string;
  reviewReason?: SettlementReviewReason;
}

export const SettlementVerificationSummarySchema =
  new Schema<SettlementVerificationSummary>(
    {
      status: { type: String, enum: ["UNVERIFIED", "VERIFIED", "REQUIRES_REVIEW"], required: true },
      dataRevision: { type: Number, min: 0, required: true, validate: Number.isSafeInteger },
      decisionRevision: { type: Number, min: 0, required: true, validate: Number.isSafeInteger },
      lastEventId: { type: Schema.Types.ObjectId, ref: "SettlementVerification" },
      verifiedDataRevision: { type: Number, min: 0, validate: Number.isSafeInteger },
      verifiedSnapshotHash: { type: String, match: /^[a-f\d]{64}$/ },
      reviewReason: {
        type: String,
        enum: ["REJECTED", "REVOKED", "DATA_CHANGED", "INTEGRITY_MISMATCH"],
      },
    },
    { _id: false },
  );

SettlementVerificationSummarySchema.pre("validate", function () {
  if (
    (this.verifiedDataRevision === undefined) !== (this.verifiedSnapshotHash === undefined) ||
    (this.verifiedDataRevision !== undefined && this.verifiedDataRevision > this.dataRevision)
  ) {
    this.invalidate("verifiedDataRevision", "Snapshot revision and hash must be consistent.");
  }
  if (
    this.status === "VERIFIED" &&
    (!this.lastEventId || !this.verifiedSnapshotHash || this.verifiedDataRevision !== this.dataRevision)
  ) {
    this.invalidate("status", "A verified subject requires a current snapshot and audit event.");
  }
  if (this.status === "REQUIRES_REVIEW" ? !this.reviewReason : Boolean(this.reviewReason)) {
    this.invalidate("reviewReason", "Review reason must match the verification status.");
  }
});
