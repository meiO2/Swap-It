import mongoose, { Model, Schema } from "mongoose";

export type SettlementVerificationStatus = "UNVERIFIED" | "VERIFIED" | "REQUIRES_REVIEW";
export type SettlementReviewReason = "REJECTED" | "REVOKED" | "DATA_CHANGED" | "INTEGRITY_MISMATCH";

export interface ILedgerEntryVerificationState {
  ledgerEntryId: mongoose.Types.ObjectId;
  status: SettlementVerificationStatus;
  decisionRevision: number;
  lastEventId?: mongoose.Types.ObjectId;
  verifiedSnapshotHash?: string;
  reviewReason?: SettlementReviewReason;
}

const LedgerEntryVerificationStateSchema = new Schema<ILedgerEntryVerificationState>(
  {
    ledgerEntryId: {
      type: Schema.Types.ObjectId,
      ref: "SellerSettlementLedger",
      required: true,
      immutable: true,
    },
    status: {
      type: String,
      enum: ["UNVERIFIED", "VERIFIED", "REQUIRES_REVIEW"],
      required: true,
      default: "UNVERIFIED",
    },
    decisionRevision: { type: Number, min: 0, required: true, default: 0, validate: Number.isSafeInteger },
    lastEventId: { type: Schema.Types.ObjectId, ref: "SettlementVerification" },
    verifiedSnapshotHash: { type: String, match: /^[a-f\d]{64}$/ },
    reviewReason: {
      type: String,
      enum: ["REJECTED", "REVOKED", "DATA_CHANGED", "INTEGRITY_MISMATCH"],
    },
  },
  { timestamps: true },
);
LedgerEntryVerificationStateSchema.pre("validate", function () {
  if (this.status === "VERIFIED" && (!this.verifiedSnapshotHash || !this.lastEventId)) {
    this.invalidate("status", "A verified entry requires a snapshot hash and audit event.");
  }
  if (this.status === "REQUIRES_REVIEW" && !this.reviewReason) {
    this.invalidate("reviewReason", "A review reason is required.");
  }
});
LedgerEntryVerificationStateSchema.index({ ledgerEntryId: 1 }, { unique: true });

const LedgerEntryVerificationState: Model<ILedgerEntryVerificationState> =
  mongoose.models.LedgerEntryVerificationState ||
  mongoose.model<ILedgerEntryVerificationState>(
    "LedgerEntryVerificationState",
    LedgerEntryVerificationStateSchema,
  );

export default LedgerEntryVerificationState;
