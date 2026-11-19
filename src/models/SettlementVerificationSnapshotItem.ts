import mongoose, { Model, Schema } from "mongoose";
import { enforceAppendOnly } from "./append-only.ts";
import { MAX_SNAPSHOT_ITEM_BYTES } from "../lib/settlement-snapshot.ts";

export interface ISettlementVerificationSnapshotItem {
  eventId: mongoose.Types.ObjectId;
  ordinal: number;
  recordType: "PAYABLE" | "RECOVERY" | "RECOVERY_ENTRY" | "LEDGER_ENTRY" | "ACTOR_RESOLUTION";
  recordId: mongoose.Types.ObjectId;
  canonicalEjson: string;
}

const SettlementVerificationSnapshotItemSchema =
  new Schema<ISettlementVerificationSnapshotItem>(
    {
      eventId: { type: Schema.Types.ObjectId, ref: "SettlementVerification", required: true },
      ordinal: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
      recordType: {
        type: String,
        enum: ["PAYABLE", "RECOVERY", "RECOVERY_ENTRY", "LEDGER_ENTRY", "ACTOR_RESOLUTION"],
        required: true,
      },
      recordId: { type: Schema.Types.ObjectId, required: true },
      canonicalEjson: {
        type: String,
        required: true,
        validate: {
          validator: (value: string) => Buffer.byteLength(value, "utf8") <= MAX_SNAPSHOT_ITEM_BYTES,
          message: "Snapshot item exceeds the size limit.",
        },
      },
    },
    { timestamps: { createdAt: true, updatedAt: false } },
  );
enforceAppendOnly(SettlementVerificationSnapshotItemSchema, "Settlement verification snapshot item");
SettlementVerificationSnapshotItemSchema.index({ eventId: 1, ordinal: 1 }, { unique: true });

const SettlementVerificationSnapshotItem: Model<ISettlementVerificationSnapshotItem> =
  mongoose.models.SettlementVerificationSnapshotItem ||
  mongoose.model<ISettlementVerificationSnapshotItem>(
    "SettlementVerificationSnapshotItem",
    SettlementVerificationSnapshotItemSchema,
  );

export default SettlementVerificationSnapshotItem;
