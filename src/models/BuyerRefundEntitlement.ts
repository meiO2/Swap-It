import mongoose, { Model, Schema } from "mongoose";

export type BuyerRefundEntitlementStatus =
  | "ENTITLEMENT_RECORDED"
  | "GP_PENDING"
  | "GP_ISSUED"
  | "FAILED_REQUIRES_ATTENTION";

export interface IBuyerRefundEntitlement {
  orderId: mongoose.Types.ObjectId;
  buyerId: mongoose.Types.ObjectId;
  refundId?: mongoose.Types.ObjectId;
  productAmount: number;
  sourceKey: string;
  status: BuyerRefundEntitlementStatus;
}

const BuyerRefundEntitlementSchema = new Schema<IBuyerRefundEntitlement>(
  {
    orderId: { type: Schema.Types.ObjectId, ref: "Order", required: true, immutable: true },
    buyerId: { type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
    refundId: { type: Schema.Types.ObjectId, ref: "Refund", immutable: true },
    productAmount: {
      type: Number,
      required: true,
      min: 1,
      immutable: true,
      validate: Number.isSafeInteger,
    },
    sourceKey: { type: String, required: true, trim: true, maxlength: 200, immutable: true },
    status: {
      type: String,
      enum: ["ENTITLEMENT_RECORDED", "GP_PENDING", "GP_ISSUED", "FAILED_REQUIRES_ATTENTION"],
      required: true,
      default: "ENTITLEMENT_RECORDED",
    },
  },
  { timestamps: true },
);
BuyerRefundEntitlementSchema.index({ orderId: 1 }, { unique: true });
BuyerRefundEntitlementSchema.index({ sourceKey: 1 }, { unique: true });

const BuyerRefundEntitlement: Model<IBuyerRefundEntitlement> =
  mongoose.models.BuyerRefundEntitlement ||
  mongoose.model<IBuyerRefundEntitlement>("BuyerRefundEntitlement", BuyerRefundEntitlementSchema);

export default BuyerRefundEntitlement;
