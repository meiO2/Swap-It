import mongoose, { Model, Schema } from "mongoose";
import {
  SettlementVerificationSummarySchema,
  type SettlementVerificationSummary,
} from "./settlement-verification-summary.ts";

export type SellerRecoveryStatus = "OUTSTANDING" | "RECOVERED";

export interface ISellerRecoveryEntry {
  amount: number;
  reason?: string;
  recordedBy: mongoose.Types.ObjectId;
  reference?: string;
  note?: string;
  evidenceUrl?: string;
  occurredAt?: Date;
  recordedAt: Date;
}

export interface ISellerRecovery {
  orderId: mongoose.Types.ObjectId;
  refundId: mongoose.Types.ObjectId;
  payableId: mongoose.Types.ObjectId;
  sellerId: mongoose.Types.ObjectId;
  settledAmount: number;
  amountDue: number;
  amountRecovered: number;
  status: SellerRecoveryStatus;
  entries: ISellerRecoveryEntry[];
  verification?: SettlementVerificationSummary;
}

const SellerRecoveryEntrySchema = new Schema<ISellerRecoveryEntry>(
  {
    amount: { type: Number, required: true, min: 1 },
    reason: { type: String, trim: true, maxlength: 1000 },
    recordedBy: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "User",
    },
    reference: { type: String, trim: true, maxlength: 200 },
    note: { type: String, trim: true, maxlength: 1000 },
    evidenceUrl: { type: String, trim: true, maxlength: 2048 },
    occurredAt: Date,
    recordedAt: { type: Date, required: true, default: Date.now },
  },
  { _id: true },
);

const SellerRecoverySchema = new Schema<ISellerRecovery>(
  {
    orderId: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    refundId: {
      type: Schema.Types.ObjectId,
      ref: "Refund",
      required: true,
      index: true,
    },
    payableId: {
      type: Schema.Types.ObjectId,
      ref: "SellerPayable",
      required: true,
      index: true,
    },
    sellerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    settledAmount: { type: Number, required: true, min: 0 },
    amountDue: { type: Number, required: true, min: 0 },
    amountRecovered: { type: Number, required: true, min: 0, default: 0 },
    status: {
      type: String,
      enum: ["OUTSTANDING", "RECOVERED"],
      required: true,
      default: "OUTSTANDING",
      index: true,
    },
    entries: { type: [SellerRecoveryEntrySchema], default: [] },
    verification: { type: SettlementVerificationSummarySchema, required: false },
  },
  { timestamps: true },
);
SellerRecoverySchema.index({ payableId: 1, refundId: 1 }, { unique: true });

const SellerRecovery: Model<ISellerRecovery> =
  mongoose.models.SellerRecovery ||
  mongoose.model<ISellerRecovery>("SellerRecovery", SellerRecoverySchema);

export default SellerRecovery;
