import mongoose, { Model, Schema } from "mongoose";
import { enforceAppendOnly } from "./append-only.ts";

export interface ISettlementEvidence {
  storageKey: string;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
  uploadedBy: mongoose.Types.ObjectId;
  uploadedAt: Date;
}

const SettlementEvidenceSchema = new Schema<ISettlementEvidence>(
  {
    storageKey: { type: String, required: true, maxlength: 1024, select: false },
    originalFileName: { type: String, required: true, maxlength: 255 },
    mimeType: { type: String, required: true, maxlength: 255 },
    sizeBytes: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
    checksumSha256: {
      type: String,
      required: true,
      lowercase: true,
      match: /^[a-f\d]{64}$/,
    },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    uploadedAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
enforceAppendOnly(SettlementEvidenceSchema, "Settlement evidence metadata");
SettlementEvidenceSchema.index({ storageKey: 1 }, { unique: true });

const SettlementEvidence: Model<ISettlementEvidence> =
  mongoose.models.SettlementEvidence ||
  mongoose.model<ISettlementEvidence>("SettlementEvidence", SettlementEvidenceSchema);

export default SettlementEvidence;
