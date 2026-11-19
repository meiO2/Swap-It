import mongoose, { Model, Schema } from "mongoose";
import { enforceAppendOnly } from "./append-only.ts";

export type SellerSettlementEntryType =
  | "SELLER_PAYMENT"
  | "OVERPAYMENT_RETURN"
  | "REFUND_RECOVERY";

export interface ISellerSettlementLedgerEntry {
  sellerPayableId: mongoose.Types.ObjectId;
  sellerRecoveryId?: mongoose.Types.ObjectId;
  orderId: mongoose.Types.ObjectId;
  sellerId: mongoose.Types.ObjectId;
  entryType: SellerSettlementEntryType;
  amount: number;
  reason: string;
  occurredAt: Date;
  recordedAt: Date;
  recordedBy: mongoose.Types.ObjectId;
  idempotencyKey: string;
  reference?: string;
  evidenceUrl?: string;
}

const SellerSettlementLedgerSchema =
  new Schema<ISellerSettlementLedgerEntry>(
    {
      sellerPayableId: {
        type: Schema.Types.ObjectId,
        ref: "SellerPayable",
        required: true,
        index: true,
      },
      sellerRecoveryId: {
        type: Schema.Types.ObjectId,
        ref: "SellerRecovery",
        index: true,
      },
      orderId: {
        type: Schema.Types.ObjectId,
        ref: "Order",
        required: true,
        index: true,
      },
      sellerId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
      },
      entryType: {
        type: String,
        enum: ["SELLER_PAYMENT", "OVERPAYMENT_RETURN", "REFUND_RECOVERY"],
        required: true,
        index: true,
      },
      amount: { type: Number, required: true, min: 1 },
      reason: { type: String, required: true, trim: true, maxlength: 1000 },
      occurredAt: { type: Date, required: true },
      recordedAt: { type: Date, required: true, default: Date.now },
      recordedBy: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
      idempotencyKey: {
        type: String,
        required: true,
        trim: true,
        maxlength: 200,
        unique: true,
      },
      reference: { type: String, trim: true, maxlength: 200 },
      evidenceUrl: { type: String, trim: true, maxlength: 2048 },
    },
    { timestamps: true },
  );
enforceAppendOnly(SellerSettlementLedgerSchema, "Seller settlement ledger");
SellerSettlementLedgerSchema.index({ sellerPayableId: 1, occurredAt: -1 });

const SellerSettlementLedger: Model<ISellerSettlementLedgerEntry> =
  mongoose.models.SellerSettlementLedger ||
  mongoose.model<ISellerSettlementLedgerEntry>(
    "SellerSettlementLedger",
    SellerSettlementLedgerSchema,
  );

export default SellerSettlementLedger;
