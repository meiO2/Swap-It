import mongoose, { Model, Schema } from "mongoose";

export const REFUND_REASONS = ["SELLER_CANCELLED", "QUALITY_INSPECTION_FAILED", "ITEM_LOST", "ITEM_DAMAGED", "ITEM_NOT_AS_DESCRIBED", "BUYER_CANCELLATION", "OTHER"] as const;
export const REFUND_STATUSES = ["REQUESTED", "UNDER_REVIEW", "APPROVED", "REJECTED", "PROCESSING", "PARTIALLY_COMPLETED", "COMPLETED", "FAILED", "CANCELLED"] as const;
export type RefundReason = (typeof REFUND_REASONS)[number];
export type RefundStatus = (typeof REFUND_STATUSES)[number];

export interface IRefund {
  orderId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  reason: RefundReason;
  description: string;
  evidence: string[];
  status: RefundStatus;
  reviewedBy?: mongoose.Types.ObjectId;
  reviewedAt?: Date;
  reviewerNote?: string;
  rejectionReason?: string;
  totalApprovedAmount?: number;
  auditLog: Array<{ status: RefundStatus; note?: string; actorId?: mongoose.Types.ObjectId; at: Date }>;
}

const AuditSchema = new Schema({ status: { type: String, enum: REFUND_STATUSES, required: true }, note: String, actorId: { type: Schema.Types.ObjectId, ref: "User" }, at: { type: Date, default: Date.now } }, { _id: false });
const RefundSchema = new Schema<IRefund>({
  orderId: { type: Schema.Types.ObjectId, ref: "Order", required: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  reason: { type: String, enum: REFUND_REASONS, required: true },
  description: { type: String, required: true, trim: true, maxlength: 2000 },
  evidence: { type: [String], default: [] },
  status: { type: String, enum: REFUND_STATUSES, default: "REQUESTED", index: true },
  reviewedBy: { type: Schema.Types.ObjectId, ref: "User" }, reviewedAt: Date, reviewerNote: { type: String, maxlength: 2000 }, rejectionReason: { type: String, maxlength: 1000 }, totalApprovedAmount: { type: Number, min: 0 },
  auditLog: { type: [AuditSchema], default: [] },
}, { timestamps: true });
RefundSchema.index({ orderId: 1, status: 1 });
const Refund: Model<IRefund> = mongoose.models.Refund || mongoose.model<IRefund>("Refund", RefundSchema);
export default Refund;
