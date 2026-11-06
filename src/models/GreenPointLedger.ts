import mongoose, { Model, Schema } from "mongoose";

export type GreenPointTransactionType =
  | "EARN"
  | "REDEEM"
  | "REFUND"
  | "EXPIRE"
  | "ADJUSTMENT"
  | "REVERSAL";

export interface IGreenPointLedger {
  userId: mongoose.Types.ObjectId;
  type: GreenPointTransactionType;
  amount: number;
  description: string;
  referenceKey: string;
  expiresAt?: Date;
  createdAt: Date;
}

const GreenPointLedgerSchema = new Schema<IGreenPointLedger>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, ref: "User", index: true },
    type: {
      type: String,
      enum: ["EARN", "REDEEM", "REFUND", "EXPIRE", "ADJUSTMENT", "REVERSAL"],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      validate: { validator: (amount: number) => Number.isSafeInteger(amount) && amount !== 0 },
    },
    description: { type: String, required: true, trim: true },
    referenceKey: { type: String, required: true, unique: true, index: true },
    expiresAt: { type: Date, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

const GreenPointLedger: Model<IGreenPointLedger> =
  mongoose.models.GreenPointLedger ||
  mongoose.model<IGreenPointLedger>("GreenPointLedger", GreenPointLedgerSchema);

export default GreenPointLedger;
