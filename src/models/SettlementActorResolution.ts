import mongoose, { Model, Schema } from "mongoose";
import { enforceAppendOnly } from "./append-only.ts";

export interface ISettlementActorResolution {
  ledgerEntryId: mongoose.Types.ObjectId;
  identifiedActorId: mongoose.Types.ObjectId;
  investigatedBy: mongoose.Types.ObjectId;
  evidenceIds: mongoose.Types.ObjectId[];
  reason: string;
  occurredAt: Date;
  idempotencyKey: string;
  requestHash: string;
}

const SettlementActorResolutionSchema = new Schema<ISettlementActorResolution>(
  {
    ledgerEntryId: { type: Schema.Types.ObjectId, ref: "SellerSettlementLedger", required: true },
    identifiedActorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    investigatedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    evidenceIds: {
      type: [{ type: Schema.Types.ObjectId, ref: "SettlementEvidence" }],
      validate: { validator: (ids: mongoose.Types.ObjectId[]) => ids.length > 0, message: "Evidence is required." },
    },
    reason: { type: String, required: true, trim: true, maxlength: 1000 },
    occurredAt: { type: Date, required: true },
    idempotencyKey: { type: String, required: true, trim: true, minlength: 8, maxlength: 200 },
    requestHash: { type: String, required: true, match: /^[a-f\d]{64}$/ },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
enforceAppendOnly(SettlementActorResolutionSchema, "Settlement actor resolution");
SettlementActorResolutionSchema.index({ ledgerEntryId: 1, occurredAt: -1, _id: -1 });
SettlementActorResolutionSchema.index({ ledgerEntryId: 1, idempotencyKey: 1 }, { unique: true });

const SettlementActorResolution: Model<ISettlementActorResolution> =
  mongoose.models.SettlementActorResolution ||
  mongoose.model<ISettlementActorResolution>("SettlementActorResolution", SettlementActorResolutionSchema);

export default SettlementActorResolution;
