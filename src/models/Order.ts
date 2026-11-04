import mongoose, { Schema, type Model } from "mongoose";
import type { OrderShape } from "@/lib/orders";

export interface IOrder extends Omit<OrderShape, "id"> {
  userId: mongoose.Types.ObjectId;
  qcAssessmentId?: mongoose.Types.ObjectId;
}

const OrderSchema = new Schema<IOrder>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  items: {
    type: [{
      productId: { type: String, required: true },
      productValue: { type: Number, required: true, min: 0 },
      quantity: { type: Number, required: true, min: 1 },
    }],
    required: true,
  },
  productValue: { type: Number, required: true, min: 0 },
  shippingFee: { type: Number, required: true, min: 0 },
  serviceFee: { type: Number, required: true, min: 0 },
  gpUsed: { type: Number, required: true, min: 0 },
  moneyPaid: { type: Number, required: true, min: 0 },
  status: { type: String, required: true, default: "Processing" },
  createdAt: { type: String, required: true },
  rewardGranted: { type: Boolean, default: false },
  delivery: { type: Schema.Types.Mixed },
  timeline: { type: [Schema.Types.Mixed], default: [] },
  trackingEvents: { type: [Schema.Types.Mixed], default: [] },
  progress: Number,
  estimatedArrival: String,
  pickupDeadline: String,
  qcStatus: { type: String, enum: ["pending", "passed", "rejected"], default: "pending" },
  qcDecisionDeadline: String,
  sellerRetrievalDeadline: String,
  sellerOutcome: { type: String, enum: ["Pending", "Retrieved", "Revamp"] },
  rewardEligible: { type: Boolean, default: true },
  qcAssessmentId: { type: Schema.Types.ObjectId, ref: "QCAssessment" },
});

const Order: Model<IOrder> = mongoose.models.Order || mongoose.model<IOrder>("Order", OrderSchema);
export default Order;
