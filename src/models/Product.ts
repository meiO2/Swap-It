
import mongoose, { Model, Schema } from "mongoose";
import type { IUserAddress } from "@/models/User";

export type ProductCondition = "NEW" | "LIKE_NEW" | "GOOD" | "FAIR";

export type ProductStatus =
  | "AVAILABLE"
  | "RESERVED"
  | "SOLD"
  | "INACTIVE"
  | "REVAMP_ELIGIBLE"
  | "REVAMPED";

export type ProductFulfillment = "Swap Hub drop-off" | "Pickup";

export interface IProduct {
  mockId?: string;
  sellerId: mongoose.Types.ObjectId;

  // Product information
  name: string;
  description: string;
  category: string;
  brand?: string;
  price: number;
  size: string;
  condition: ProductCondition;
  images: string[];

  // Seller handover preferences
  fulfillment: ProductFulfillment;
  pickupDate?: string;
  pickupAddress?: IUserAddress;
  pickupChanges: number;

  // Product lifecycle
  status: ProductStatus;
  publishedAt: Date | null;

  createdAt?: Date;
  updatedAt?: Date;
}

const ProductSchema = new Schema<IProduct>(
  {
    mockId: { type: String, trim: true, unique: true, sparse: true, index: true },
    sellerId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "User",
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 120,
    },

    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },

    category: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
      index: true,
    },

    brand: {
      type: String,
      trim: true,
      maxlength: 80,
    },

    price: {
      type: Number,
      required: true,
      min: 1,
    },

    size: {
      type: String,
      required: true,
      trim: true,
      maxlength: 30,
      index: true,
    },

    condition: {
      type: String,
      enum: ["NEW", "LIKE_NEW", "GOOD", "FAIR"],
      required: true,
      index: true,
    },

    images: {
      type: [String],
      required: true,
      validate: {
        validator: (images: string[]) =>
          images.length > 0 && images.length <= 8,
        message: "A product must have between 1 and 8 images.",
      },
    },

    // Seller chooses how the physical item reaches SwapIt.
    fulfillment: {
      type: String,
      enum: ["Swap Hub drop-off", "Pickup"],
      default: "Swap Hub drop-off",
      required: true,
    },

    pickupDate: {
      type: String,
    },

    pickupAddress: {
      type: Schema.Types.Mixed,
    },

    pickupChanges: {
      type: Number,
      default: 0,
      min: 0,
      max: 1,
    },

    // Newly submitted products are immediately available.
    status: {
      type: String,
      enum: [
        "AVAILABLE",
        "RESERVED",
        "SOLD",
        "INACTIVE",
        "REVAMP_ELIGIBLE",
        "REVAMPED",
      ],
      default: "AVAILABLE",
      required: true,
      index: true,
    },

    publishedAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  { timestamps: true },
);

ProductSchema.index({ status: 1, createdAt: -1 });
ProductSchema.index({ status: 1, price: 1 });
ProductSchema.index({ name: "text" });

const Product: Model<IProduct> =
  mongoose.models.Product ||
  mongoose.model<IProduct>("Product", ProductSchema);

export default Product;
