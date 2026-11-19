import mongoose, { Model, Schema } from "mongoose";
import type { SellerFinancialResolutionStatus } from "./SellerFinancialResolution.ts";

export interface ISellerFinancialResolutionItem {
  resolutionId: mongoose.Types.ObjectId;
  payableId: mongoose.Types.ObjectId;
  status: SellerFinancialResolutionStatus;
  revision: number;
}

const SellerFinancialResolutionItemSchema = new Schema<ISellerFinancialResolutionItem>(
  {
    resolutionId: {
      type: Schema.Types.ObjectId,
      ref: "SellerFinancialResolution",
      required: true,
      immutable: true,
    },
    payableId: {
      type: Schema.Types.ObjectId,
      ref: "SellerPayable",
      required: true,
      immutable: true,
    },
    status: {
      type: String,
      enum: ["PENDING", "ON_HOLD", "READY_FOR_REVIEW", "RESOLVED", "FAILED_REQUIRES_ATTENTION"],
      required: true,
      default: "PENDING",
    },
    revision: { type: Number, required: true, min: 0, default: 0, validate: Number.isSafeInteger },
  },
  { timestamps: true },
);
SellerFinancialResolutionItemSchema.index({ resolutionId: 1, payableId: 1 }, { unique: true });

const SellerFinancialResolutionItem: Model<ISellerFinancialResolutionItem> =
  mongoose.models.SellerFinancialResolutionItem ||
  mongoose.model<ISellerFinancialResolutionItem>(
    "SellerFinancialResolutionItem",
    SellerFinancialResolutionItemSchema,
  );

export default SellerFinancialResolutionItem;
