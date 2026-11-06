import mongoose, { Model, Schema } from "mongoose";

export interface ISwapHub {
  hubId: string;
  name: string;
  address: string;
  distance: string;
  position: [number, number];
  openingHours: string;
  isActive: boolean;
}

const SwapHubSchema = new Schema<ISwapHub>(
  {
    hubId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    address: { type: String, required: true, trim: true },
    distance: { type: String, required: true, trim: true },
    position: {
      type: [Number],
      required: true,
      validate: {
        validator: (value: number[]) => value.length === 2,
        message: "A hub position must contain latitude and longitude.",
      },
    },
    openingHours: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

const SwapHub: Model<ISwapHub> =
  mongoose.models.SwapHub ||
  mongoose.model<ISwapHub>("SwapHub", SwapHubSchema);

export default SwapHub;
