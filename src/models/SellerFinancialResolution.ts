import mongoose, { Model, Schema } from "mongoose";

export type SellerFinancialResolutionStatus =
  | "PENDING"
  | "ON_HOLD"
  | "READY_FOR_REVIEW"
  | "RESOLVED"
  | "FAILED_REQUIRES_ATTENTION";

export interface ISellerFinancialResolution {
  entitlementId: mongoose.Types.ObjectId;
  orderId: mongoose.Types.ObjectId;
  status: SellerFinancialResolutionStatus;
  revision: number;
  failedAttempts: number;
  nextAttemptAt?: Date;
  lastFailureAt?: Date;
}

const SellerFinancialResolutionSchema = new Schema<ISellerFinancialResolution>(
  {
    entitlementId: {
      type: Schema.Types.ObjectId,
      ref: "BuyerRefundEntitlement",
      required: true,
      immutable: true,
    },
    orderId: { type: Schema.Types.ObjectId, ref: "Order", required: true, immutable: true },
    status: {
      type: String,
      enum: ["PENDING", "ON_HOLD", "READY_FOR_REVIEW", "RESOLVED", "FAILED_REQUIRES_ATTENTION"],
      required: true,
      default: "PENDING",
    },
    revision: { type: Number, required: true, default: 0, min: 0, validate: Number.isSafeInteger },
    failedAttempts: { type: Number, required: true, default: 0, min: 0, validate: Number.isSafeInteger },
    nextAttemptAt: Date,
    lastFailureAt: Date,
  },
  { timestamps: true },
);
SellerFinancialResolutionSchema.index({ entitlementId: 1 }, { unique: true });
SellerFinancialResolutionSchema.index({ status: 1, createdAt: 1, _id: 1 });

const SellerFinancialResolution: Model<ISellerFinancialResolution> =
  mongoose.models.SellerFinancialResolution ||
  mongoose.model<ISellerFinancialResolution>("SellerFinancialResolution", SellerFinancialResolutionSchema);

export default SellerFinancialResolution;
