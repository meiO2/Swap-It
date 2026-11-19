import mongoose, { Model, Schema } from "mongoose";

export type PendingGreenPointCreditStatus =
  | "PENDING_REWARD"
  | "PENDING_REFUND_GP"
  | "ISSUED"
  | "CANCELLED";

export type PendingGreenPointCreditSource =
  | "PURCHASE"
  | "REGISTRATION"
  | "DONATION"
  | "REFUND"
  | "OTHER";

export type PendingGreenPointLedgerType = "EARN" | "REFUND" | "ADJUSTMENT";

export interface IPendingGreenPointCredit {
  _id?: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  amount: number;
  source: PendingGreenPointCreditSource;
  status: PendingGreenPointCreditStatus;
  description: string;
  referenceKey: string;
  components: Array<{
    amount: number;
    description: string;
    referenceKey: string;
    ledgerType: PendingGreenPointLedgerType;
  }>;
  orderId?: mongoose.Types.ObjectId;
  refundId?: mongoose.Types.ObjectId;
  issuedAt?: Date;
  cancelledAt?: Date;
}

const PendingGreenPointComponentSchema = new Schema(
  {
    amount: { type: Number, required: true, min: 1 },
    description: { type: String, required: true, trim: true },
    referenceKey: { type: String, required: true },
    ledgerType: {
      type: String,
      enum: ["EARN", "REFUND", "ADJUSTMENT"],
      required: true,
    },
  },
  { _id: false },
);

const PendingGreenPointCreditSchema =
  new Schema<IPendingGreenPointCredit>(
    {
      userId: {
        type: Schema.Types.ObjectId,
        required: true,
        ref: "User",
        index: true,
      },
      amount: { type: Number, required: true, min: 1 },
      source: {
        type: String,
        enum: ["PURCHASE", "REGISTRATION", "DONATION", "REFUND", "OTHER"],
        required: true,
        index: true,
      },
      status: {
        type: String,
        enum: ["PENDING_REWARD", "PENDING_REFUND_GP", "ISSUED", "CANCELLED"],
        required: true,
        index: true,
      },
      description: { type: String, required: true, trim: true },
      referenceKey: { type: String, required: true, unique: true, index: true },
      components: { type: [PendingGreenPointComponentSchema], required: true },
      orderId: { type: Schema.Types.ObjectId, ref: "Order", index: true },
      refundId: { type: Schema.Types.ObjectId, ref: "Refund", index: true },
      issuedAt: Date,
      cancelledAt: Date,
    },
    { timestamps: true },
  );
PendingGreenPointCreditSchema.index({ status: 1, createdAt: 1 });

const PendingGreenPointCredit: Model<IPendingGreenPointCredit> =
  mongoose.models.PendingGreenPointCredit ||
  mongoose.model<IPendingGreenPointCredit>(
    "PendingGreenPointCredit",
    PendingGreenPointCreditSchema,
  );

export default PendingGreenPointCredit;
