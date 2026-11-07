
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

export interface IShippingOrigin {
  label?: string;
  postalCode?: string;
}

export interface IPickupHub {
  id?: string;
  name?: string;
  address?: string;
  distance?: string;
  openingHours?: string;
}

export type HandoverMethod = "HUB_DROP_OFF" | "PICKUP";

export type HandoverStatus =
  | "AWAITING_PAYMENT"
  | "AWAITING_SELLER_SCHEDULE"
  | "SCHEDULED"
  | "IN_TRANSIT"
  | "RECEIVED"
  | "CANCELLED";


export type ItemQCStatus =
  | "NOT_STARTED"
  | "PENDING"
  | "PASSED"
  | "FAILED_AWAITING_BUYER"
  | "BUYER_ACCEPTED"
  | "BUYER_REJECTED"
  | "EXPIRED";

export type BuyerQCDecision = "ACCEPT" | "REJECT";

export interface IHandoverReschedule {
  previousScheduledAt: Date;
  newScheduledAt: Date;
  changedAt: Date;
  changedBy: mongoose.Types.ObjectId;
}

export interface IOrderHandover {
  method: HandoverMethod;
  status: HandoverStatus;

  hubId?: string;
  hubName?: string;
  hubAddress?: string;

  scheduledAt?: Date;
  pickupAddress?: IOrderAddress;

  requestedAt?: Date;
  receivedAt?: Date;
  receivedBy?: mongoose.Types.ObjectId;

  // Rescheduling
  rescheduleCount: number;
  rescheduleHistory: IHandoverReschedule[];
}


export interface IOrderItem {
  productId: mongoose.Types.ObjectId;
  sellerId: mongoose.Types.ObjectId;
  name: string;
  price: number;
  image?: string;
  handover?: IOrderHandover;

  // Quality control
  qcStatus?: ItemQCStatus;
  qcAssessmentId?: mongoose.Types.ObjectId;
  qcDecisionDeadline?: Date;

  // Buyer's decision after failed QC
  buyerQcDecision?: BuyerQCDecision;
  buyerQcDecisionAt?: Date;
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
  courierCode?: string;
  courierName?: string;
  courierServiceCode?: string;
  courierService?: string;
  estimatedDeliveryTime?: string;
  shippingMode?: "mock" | "biteship";
  shippingOrigin?: IShippingOrigin;
  shippingAddress?: IOrderAddress;
  pickupHub?: IPickupHub;
  status: OrderStatus;
  expiresAt: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

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

const HandoverRescheduleSchema =
  new Schema<IHandoverReschedule>(
    {
      previousScheduledAt: {
        type: Date,
        required: true,
      },
      newScheduledAt: {
        type: Date,
        required: true,
      },
      changedAt: {
        type: Date,
        required: true,
        default: Date.now,
      },
      changedBy: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    },
    { _id: false },
  );

const HandoverSchema = new Schema<IOrderHandover>(
  {
    method: {
      type: String,
      enum: ["HUB_DROP_OFF", "PICKUP"],
      required: true,
    },
    status: {
      type: String,
      enum: [
        "AWAITING_PAYMENT",
        "AWAITING_SELLER_SCHEDULE",
        "SCHEDULED",
        "IN_TRANSIT",
        "RECEIVED",
        "CANCELLED",
      ],
      default: "AWAITING_PAYMENT",
      required: true,
    },
    hubId: { type: String, trim: true },
    hubName: { type: String, trim: true },
    hubAddress: { type: String, trim: true },
    scheduledAt: { type: Date },
    pickupAddress: { type: AddressSchema },
    requestedAt: { type: Date },
    receivedAt: { type: Date },
    receivedBy: { type: Schema.Types.ObjectId, ref: "User" },
    rescheduleCount: {
      type: Number,
      default: 0,
      min: 0,
      max: 1,
    },

    rescheduleHistory: {
      type: [HandoverRescheduleSchema],
      default: [],
    },
  },
  { _id: false },
);

const OrderItemSchema = new Schema<IOrderItem>(
  {
    productId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Product",
    },
    sellerId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "User",
    },
    name: { type: String, required: true },
    price: { type: Number, required: true, min: 1 },
    image: { type: String },
    handover: { type: HandoverSchema },
        
    qcStatus: {
      type: String,
      enum: [
        "NOT_STARTED",
        "PENDING",
        "PASSED",
        "FAILED_AWAITING_BUYER",
        "BUYER_ACCEPTED",
        "BUYER_REJECTED",
        "EXPIRED",
      ],
      default: "NOT_STARTED",
    },

    qcAssessmentId: {
      type: Schema.Types.ObjectId,
      ref: "QCAssessment",
    },

    qcDecisionDeadline: {
      type: Date,
    },

    buyerQcDecision: {
      type: String,
      enum: ["ACCEPT", "REJECT"],
    },

    buyerQcDecisionAt: {
      type: Date,
    },

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
    courierCode: { type: String, trim: true },
    courierName: { type: String, trim: true },
    courierServiceCode: { type: String, trim: true },
    courierService: { type: String, trim: true },
    estimatedDeliveryTime: { type: String, trim: true },
    shippingMode: { type: String, enum: ["mock", "biteship"] },
    shippingOrigin: {
      label: { type: String, trim: true },
      postalCode: { type: String, trim: true },
    },
    shippingAddress: { type: AddressSchema },
    pickupHub: {
      id: { type: String, trim: true },
      name: { type: String, trim: true },
      address: { type: String, trim: true },
      distance: { type: String, trim: true },
      openingHours: { type: String, trim: true },
    },
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
