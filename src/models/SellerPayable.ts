import mongoose, { Model, Schema } from "mongoose";
import {
  SettlementVerificationSummarySchema,
  type SettlementVerificationSummary,
} from "./settlement-verification-summary.ts";

export type SellerPayableStatus =
  | "PENDING"
  | "PARTIALLY_SETTLED"
  | "OVERPAID"
  | "SETTLED"
  | "CANCELLED";

export interface ISellerPayable {
  orderId: mongoose.Types.ObjectId;
  sellerId: mongoose.Types.ObjectId;
  sellerSubtotal: number;
  transactionFee: number;
  payableAmount: number;
  totalPaid?: number;
  overpaymentReturned?: number;
  status: SellerPayableStatus;
  settledAmount?: number;
  settledBy?: mongoose.Types.ObjectId;
  settledAt?: Date;
  settlementReference?: string;
  settlementNote?: string;
  cancelledAt?: Date;
  ledgerBaseline?: "ZERO_AT_CREATION";
  verification?: SettlementVerificationSummary;
}

const SellerPayableSchema = new Schema<ISellerPayable>(
  {
    orderId: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    sellerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    sellerSubtotal: { type: Number, required: true, min: 0 },
    transactionFee: { type: Number, required: true, min: 0 },
    payableAmount: { type: Number, required: true, min: 0, immutable: true },
    totalPaid: { type: Number, min: 0 },
    overpaymentReturned: { type: Number, min: 0 },
    status: {
      type: String,
      enum: [
        "PENDING",
        "PARTIALLY_SETTLED",
        "OVERPAID",
        "SETTLED",
        "CANCELLED",
      ],
      default: "PENDING",
      required: true,
      index: true,
    },
    settledAmount: { type: Number, min: 0 },
    settledBy: { type: Schema.Types.ObjectId, ref: "User" },
    settledAt: Date,
    settlementReference: { type: String, trim: true, maxlength: 200 },
    settlementNote: { type: String, trim: true, maxlength: 1000 },
    cancelledAt: Date,
    ledgerBaseline: { type: String, enum: ["ZERO_AT_CREATION"], immutable: true },
    verification: { type: SettlementVerificationSummarySchema, required: false },
  },
  { timestamps: true },
);
SellerPayableSchema.index({ orderId: 1, sellerId: 1 }, { unique: true });

const SellerPayable: Model<ISellerPayable> =
  mongoose.models.SellerPayable ||
  mongoose.model<ISellerPayable>("SellerPayable", SellerPayableSchema);

export default SellerPayable;
