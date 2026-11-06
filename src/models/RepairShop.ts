import { Model, Schema } from "mongoose";
import mongoose from "mongoose";

export interface IRepairShop {
  shopId: string;
  name: string;
  category: string;
  rating: number;
  distance: string;
  address: string;
  image: string;
  isActive: boolean;
}

const RepairShopSchema = new Schema<IRepairShop>(
  {
    shopId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    rating: { type: Number, required: true, min: 0, max: 5 },
    distance: { type: String, required: true, trim: true },
    address: { type: String, required: true, trim: true },
    image: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

const RepairShop: Model<IRepairShop> =
  mongoose.models.RepairShop ||
  mongoose.model<IRepairShop>("RepairShop", RepairShopSchema);

export default RepairShop;
