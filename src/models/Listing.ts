import mongoose, { Schema, type Model } from "mongoose";
import type { IUserAddress } from "@/models/User";

export type ListingStatus = "Submitted" | "Sorting" | "Passed" | "Not Eligible" | "Unsold";

export interface IListing {
  sellerId: mongoose.Types.ObjectId;
  title: string;
  category: string;
  size: string;
  condition: string;
  description?: string;
  image?: string;
  price: number;
  fulfillment: "Swap Hub drop-off" | "Pickup";
  pickupDate?: string;
  pickupAddress?: IUserAddress;
  pickupChanges: number;
  status: ListingStatus;
  createdAt?: Date;
  updatedAt?: Date;
}

const ListingSchema = new Schema<IListing>({
  sellerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 70 },
  category: { type: String, required: true, trim: true, maxlength: 80 },
  size: { type: String, required: true, trim: true, maxlength: 30 },
  condition: { type: String, required: true, trim: true, maxlength: 100 },
  description: { type: String, trim: true, maxlength: 2000 },
  image: { type: String, trim: true, maxlength: 2000000 },
  price: { type: Number, required: true, min: 1 },
  fulfillment: { type: String, enum: ["Swap Hub drop-off", "Pickup"], required: true },
  pickupDate: String,
  pickupAddress: { type: Schema.Types.Mixed },
  pickupChanges: { type: Number, default: 0, min: 0, max: 1 },
  status: { type: String, enum: ["Submitted", "Sorting", "Passed", "Not Eligible", "Unsold"], default: "Submitted" },
}, { timestamps: true });

const Listing: Model<IListing> = mongoose.models.Listing || mongoose.model<IListing>("Listing", ListingSchema);
export default Listing;
