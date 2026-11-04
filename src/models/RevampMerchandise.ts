import mongoose, { Schema, type Model } from "mongoose";

// ASSUMPTION: Draft, available, and archived are management states only; no
// Revamp business workflow/status was confirmed in the product requirements.
export type RevampStatus = "draft" | "available" | "archived";

export interface IRevampMerchandise {
  name: string;
  category: string;
  size: string;
  condition: string;
  description: string;
  price: number;
  image: string;
  status: RevampStatus;
  createdBy: mongoose.Types.ObjectId;
}

const RevampMerchandiseSchema = new Schema<IRevampMerchandise>({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  category: { type: String, required: true, trim: true, maxlength: 80 },
  size: { type: String, required: true, trim: true, maxlength: 30 },
  condition: { type: String, required: true, trim: true, maxlength: 100 },
  description: { type: String, required: true, trim: true, maxlength: 2000 },
  price: { type: Number, required: true, min: 1 },
  image: { type: String, required: true, trim: true, maxlength: 2000 },
  status: { type: String, enum: ["draft", "available", "archived"], default: "draft" },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });

const RevampMerchandise: Model<IRevampMerchandise> = mongoose.models.RevampMerchandise || mongoose.model<IRevampMerchandise>("RevampMerchandise", RevampMerchandiseSchema);
export default RevampMerchandise;
