import mongoose, { Model, Schema } from "mongoose";

export const GREEN_POINT_RESERVE_ENTRY_TYPES = [
  "ADMIN_TOP_UP",
  "REDEMPTION_RESERVED",
  "REDEMPTION_RELEASED",
  "REDEMPTION",
] as const;

export type GreenPointReserveEntryType =
  (typeof GREEN_POINT_RESERVE_ENTRY_TYPES)[number];

export interface IGreenPointReserveLedgerEntry {
  type: GreenPointReserveEntryType;
  amount: number;
  balanceDelta: number;
  balanceAfter: number;
  reservedRedemptionsAfter: number;
  referenceKey: string;
  orderId?: mongoose.Types.ObjectId;
  actorId?: mongoose.Types.ObjectId;
  externalReference?: string;
  evidenceUrl?: string;
  note?: string;
  createdAt: Date;
}

const GreenPointReserveLedgerSchema =
  new Schema<IGreenPointReserveLedgerEntry>(
    {
      type: {
        type: String,
        enum: GREEN_POINT_RESERVE_ENTRY_TYPES,
        required: true,
      },
      amount: { type: Number, required: true, min: 0 },
      balanceDelta: { type: Number, required: true },
      balanceAfter: { type: Number, required: true, min: 0 },
      reservedRedemptionsAfter: { type: Number, required: true, min: 0 },
      referenceKey: { type: String, required: true, unique: true, index: true },
      orderId: { type: Schema.Types.ObjectId, ref: "Order", index: true },
      actorId: { type: Schema.Types.ObjectId, ref: "User" },
      externalReference: { type: String, trim: true, maxlength: 200 },
      evidenceUrl: { type: String, trim: true, maxlength: 2048 },
      note: { type: String, trim: true, maxlength: 1000 },
    },
    { timestamps: { createdAt: true, updatedAt: false } },
  );

const GreenPointReserveLedger: Model<IGreenPointReserveLedgerEntry> =
  mongoose.models.GreenPointReserveLedger ||
  mongoose.model<IGreenPointReserveLedgerEntry>(
    "GreenPointReserveLedger",
    GreenPointReserveLedgerSchema,
  );

export default GreenPointReserveLedger;
