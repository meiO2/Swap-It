import mongoose, { Model, Schema } from "mongoose";

export type OrderStatus =
  | "PENDING_PAYMENT"
  | "PAID"
  | "PROCESSING"
  | "SHIPPED"
  | "DELIVERED"
  | "COMPLETED"
  | "CANCELLED"
  | "EXPIRED"
  | "REFUNDED";

export type DeliveryMethod = "courier" | "pickup";

export interface IOrderAddress {
  name: string;
  phone: string;
  address: string;
  city: string;
  postalCode: string;
}

export interface IOrderItem {
  productId: mongoose.Types.ObjectId;
  sellerId: mongoose.Types.ObjectId;
  name: string;
  price: number;
  image?: string;
}

export interface IOrder {
  buyerId: mongoose.Types.ObjectId;
  items: IOrderItem[];
  subtotal: number;
  shippingFee: number;
  serviceFee: number;
  gpUsed: number;
  totalAmount: number;
  deliveryMethod: DeliveryMethod;
  shippingAddress?: IOrderAddress;
  status: OrderStatus;
  expiresAt: Date;
}

const OrderItemSchema = new Schema<IOrderItem>(
  {
    productId: { type: Schema.Types.ObjectId, required: true, ref: "Product" },
    sellerId: { type: Schema.Types.ObjectId, required: true, ref: "User" },
    name: { type: String, required: true },
    price: { type: Number, required: true, min: 1 },
    image: { type: String },
  },
  { _id: false },
);

const AddressSchema = new Schema<IOrderAddress>(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    address: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    postalCode: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const OrderSchema = new Schema<IOrder>(
  {
    buyerId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "User",
      index: true,
    },
    items: {
      type: [OrderItemSchema],
      required: true,
      validate: {
        validator: (items: IOrderItem[]) => items.length > 0,
        message: "An order must contain at least one item.",
      },
    },
    subtotal: { type: Number, required: true, min: 1 },
    shippingFee: { type: Number, required: true, min: 0, default: 0 },
    serviceFee: { type: Number, required: true, min: 0, default: 0 },
    gpUsed: { type: Number, required: true, min: 0, default: 0 },
    totalAmount: { type: Number, required: true, min: 1 },
    deliveryMethod: {
      type: String,
      enum: ["courier", "pickup"],
      required: true,
    },
    shippingAddress: { type: AddressSchema },
    status: {
      type: String,
      enum: [
        "PENDING_PAYMENT",
        "PAID",
        "PROCESSING",
        "SHIPPED",
        "DELIVERED",
        "COMPLETED",
        "CANCELLED",
        "EXPIRED",
        "REFUNDED",
      ],
      required: true,
      default: "PENDING_PAYMENT",
      index: true,
    },
    expiresAt: { type: Date, required: true, index: true },
  },
  { timestamps: true },
);

const Order: Model<IOrder> =
  mongoose.models.Order || mongoose.model<IOrder>("Order", OrderSchema);

export default Order;
