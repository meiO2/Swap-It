import mongoose, { Model, Schema } from "mongoose";

export type ProductCondition = "NEW" | "LIKE_NEW" | "GOOD" | "FAIR";
export type ProductStatus =
  | "AVAILABLE"
  | "RESERVED"
  | "SOLD"
  | "INACTIVE"
  | "REVAMP_ELIGIBLE"
  | "REVAMPED";

export interface IProduct {
  sellerId: mongoose.Types.ObjectId;
  name: string;
  description: string;
  categoryId: mongoose.Types.ObjectId;
  brand?: string;
  price: number;
  size: string;
  condition: ProductCondition;
  images: string[];
  status: ProductStatus;
  publishedAt: Date | null;
}

const ProductSchema = new Schema<IProduct>(
  {
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
    categoryId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Category",
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
