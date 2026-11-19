import mongoose, { Model, Schema } from "mongoose";
import type { SettlementHoldReason } from "../lib/settlement-verification-policy.ts";

export interface ISettlementFinancialHold {
  subjectType: "PAYABLE" | "RECOVERY";
  subjectId: mongoose.Types.ObjectId;
  reason: SettlementHoldReason;
  status: "ACTIVE" | "RESOLVED";
  description: string;
  resolvedBy?: mongoose.Types.ObjectId;
  resolvedAt?: Date;
  resolutionReason?: string;
  resolutionEvidenceIds?: mongoose.Types.ObjectId[];
}

const SettlementFinancialHoldSchema = new Schema<ISettlementFinancialHold>(
  {
    subjectType: {
      type: String,
      enum: ["PAYABLE", "RECOVERY"],
      required: true,
      immutable: true,
    },
    subjectId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    reason: {
      type: String,
      enum: ["INTEGRITY_MISMATCH", "FINANCIAL_INVARIANT_FAILED", "UNRESOLVED_AMOUNT_PROVENANCE"],
      required: true,
      immutable: true,
    },
    status: { type: String, enum: ["ACTIVE", "RESOLVED"], required: true, default: "ACTIVE" },
    description: { type: String, required: true, trim: true, maxlength: 1000, immutable: true },
    resolvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    resolvedAt: Date,
    resolutionReason: { type: String, trim: true, maxlength: 1000 },
    resolutionEvidenceIds: [{ type: Schema.Types.ObjectId, ref: "SettlementEvidence" }],
  },
  { timestamps: true },
);
SettlementFinancialHoldSchema.pre("validate", function () {
  if (
    this.status === "RESOLVED" &&
    (!this.resolvedBy || !this.resolvedAt || !this.resolutionReason || !this.resolutionEvidenceIds?.length)
  ) {
    this.invalidate("status", "A resolved hold requires an actor, time, reason, and evidence.");
  }
});
SettlementFinancialHoldSchema.index({ subjectType: 1, subjectId: 1, status: 1 });

const SettlementFinancialHold: Model<ISettlementFinancialHold> =
  mongoose.models.SettlementFinancialHold ||
  mongoose.model<ISettlementFinancialHold>("SettlementFinancialHold", SettlementFinancialHoldSchema);

export default SettlementFinancialHold;
