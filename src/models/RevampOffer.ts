import mongoose, { Schema, type Model } from "mongoose";

export type RevampOfferStatus = "PENDING" | "ACCEPTED" | "REJECTED" | "EXPIRED";

export interface IRevampOffer {
  productId: mongoose.Types.ObjectId;
  sellerId: mongoose.Types.ObjectId;
  originalPrice: number;
  offerAmount: number;
  status: RevampOfferStatus;
  expiresAt: Date;
  decidedAt?: Date;
}

const RevampOfferSchema = new Schema<IRevampOffer>({
  productId: { type: Schema.Types.ObjectId, ref: "Product", required: true, unique: true, index: true },
  sellerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  originalPrice: { type: Number, required: true, min: 1 },
  offerAmount: { type: Number, required: true, min: 1 },
  status: { type: String, enum: ["PENDING", "ACCEPTED", "REJECTED", "EXPIRED"], default: "PENDING", index: true },
  expiresAt: { type: Date, required: true, index: true },
  decidedAt: { type: Date },
}, { timestamps: true });

RevampOfferSchema.index({ sellerId: 1, status: 1, createdAt: -1 });
const RevampOffer: Model<IRevampOffer> = mongoose.models.RevampOffer || mongoose.model<IRevampOffer>("RevampOffer", RevampOfferSchema);
export default RevampOffer;
