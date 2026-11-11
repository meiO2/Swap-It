import mongoose, { Model, Schema } from "mongoose";

export type PaymentStatus =
  | "PENDING"
  | "PAID"
  | "FAILED"
  | "CANCELED"
  | "EXPIRED";

export interface IPayment {
  orderId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  transactionId?: string;
  midtransOrderId?: string;
  xenditSessionId?: string;
  xenditQrCodeId?: string;
  xenditQrString?: string;
  xenditReferenceId?: string;
  xenditPaymentRequestId?: string;
  grossAmount: number;
  paymentType?: string;
  status: PaymentStatus;
  snapToken?: string;
  redirectUrl?: string;
  paymentData?: Record<string, unknown>;
  paidAt?: Date;
}

const PaymentSchema = new Schema<IPayment>(
  {
    orderId: {
      type: Schema.Types.ObjectId,
      required: true,
      unique: true,
      ref: "Order",
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "User",
      index: true,
    },
    transactionId: { type: String, trim: true },
    midtransOrderId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    xenditSessionId: { type: String, unique: true, sparse: true, index: true },
    xenditQrCodeId: { type: String, unique: true, sparse: true, index: true },
    xenditQrString: { type: String },
    xenditReferenceId: { type: String, unique: true, sparse: true, index: true },
    xenditPaymentRequestId: { type: String, trim: true },
    grossAmount: { type: Number, required: true, min: 1 },
    paymentType: { type: String, trim: true },
    status: {
      type: String,
      enum: ["PENDING", "PAID", "FAILED", "CANCELED", "EXPIRED"],
      default: "PENDING",
      required: true,
      index: true,
    },
    snapToken: { type: String, trim: true },
    redirectUrl: { type: String, trim: true },
    paymentData: { type: Schema.Types.Mixed },
    paidAt: { type: Date },
  },
  { timestamps: true },
);

const Payment: Model<IPayment> =
  mongoose.models.Payment ||
  mongoose.model<IPayment>("Payment", PaymentSchema);

export default Payment;
