import mongoose, { Model, Schema } from "mongoose";

export interface ICartItem {
  productId: mongoose.Types.ObjectId;
  addedAt: Date;
}

export interface ICart {
  userId: mongoose.Types.ObjectId;
  items: ICartItem[];
}

const CartItemSchema = new Schema<ICartItem>(
  {
    productId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Product",
    },
    addedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  { _id: false },
);

const CartSchema = new Schema<ICart>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
      unique: true,
      ref: "User",
      index: true,
    },
    items: {
      type: [CartItemSchema],
      default: [],
    },
  },
  { timestamps: true },
);

const Cart: Model<ICart> =
  mongoose.models.Cart || mongoose.model<ICart>("Cart", CartSchema);

export default Cart;
