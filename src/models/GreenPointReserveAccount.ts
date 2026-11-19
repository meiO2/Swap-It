import mongoose, { Model, Schema } from "mongoose";

export interface IGreenPointReserveAccount {
  _id: string;
  balance: number;
  reservedRedemptions: number;
  targetBalance: number;
  warningThreshold: number;
  revision: number;
}

const GreenPointReserveAccountSchema = new Schema<IGreenPointReserveAccount>(
  {
    _id: { type: String, default: "SWAPIT" },
    balance: { type: Number, required: true, min: 0, default: 0 },
    reservedRedemptions: { type: Number, required: true, min: 0, default: 0 },
    targetBalance: { type: Number, required: true, min: 0, default: 100_000 },
    warningThreshold: { type: Number, required: true, min: 0, default: 20_000 },
    revision: { type: Number, required: true, default: 0 },
  },
  { timestamps: true },
);

const GreenPointReserveAccount: Model<IGreenPointReserveAccount> =
  mongoose.models.GreenPointReserveAccount ||
  mongoose.model<IGreenPointReserveAccount>(
    "GreenPointReserveAccount",
    GreenPointReserveAccountSchema,
  );

export default GreenPointReserveAccount;
