import mongoose, { Model, Schema } from "mongoose";

export type PaymentStatus =
  | "PENDING"
  | "PAID"
  | "FAILED"
  | "CANCELED"
  | "EXPIRED";

export type PaymentProvider = "XENDIT" | "PRASMUL";

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
  provider?: PaymentProvider;
  prasmulOrderId?: string;
  prasmulQrId?: string;
  prasmulPaymentCode?: string;
  prasmulExpiredPayment?: Date;
  prasmulBasicPrice?: number;
  prasmulAmount?: number;

  prasmulAdminFee?: number;
  prasmulPpnAdminFee?: number;
  prasmulProcessingFee?: number;
  prasmulPpnProcessingFee?: number;
  prasmulPlatformFee?: number;
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
    provider: {
      type: String,
      enum: ["XENDIT", "PRASMUL"],
      default: "XENDIT",
      index: true,
    },

    prasmulOrderId: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
      index: true,
    },

    prasmulQrId: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
      index: true,
    },

    prasmulPaymentCode: {
      type: String,
      trim: true,
    },

    prasmulExpiredPayment: {
      type: Date,
    },
    prasmulBasicPrice: {
      type: Number,
      min: 0,
    },

    prasmulAmount: {
      type: Number,
      min: 0,
    },

    prasmulAdminFee: {
      type: Number,
      min: 0,
    },

    prasmulPpnAdminFee: {
      type: Number,
      min: 0,
    },

    prasmulProcessingFee: {
      type: Number,
      min: 0,
    },

    prasmulPpnProcessingFee: {
      type: Number,
      min: 0,
    },

    prasmulPlatformFee: {
      type: Number,
      min: 0,
    },
    xenditSessionId: { type: String, unique: true, sparse: true, index: true },
    xenditQrCodeId: { type: String, unique: true, sparse: true, index: true },
    xenditQrString: { type: String },
    xenditReferenceId: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
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
