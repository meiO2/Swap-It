import mongoose, { Model, Schema } from "mongoose";

export interface ISettlementIncident {
  payableId: mongoose.Types.ObjectId;
  reportedBy: mongoose.Types.ObjectId;
  reportedAt: Date;
  description: string;
  reportedAmount?: number;
  evidenceIds: mongoose.Types.ObjectId[];
  status: "OPEN" | "UNDER_REVIEW" | "RESOLVED";
  revision: number;
}

const SettlementIncidentSchema = new Schema<ISettlementIncident>(
  {
    payableId: { type: Schema.Types.ObjectId, ref: "SellerPayable", required: true, immutable: true },
    reportedBy: { type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
    reportedAt: { type: Date, required: true, immutable: true },
    description: { type: String, required: true, trim: true, maxlength: 2000, immutable: true },
    reportedAmount: { type: Number, min: 1, validate: Number.isSafeInteger, immutable: true },
    evidenceIds: {
      type: [{ type: Schema.Types.ObjectId, ref: "SettlementEvidence" }],
      validate: { validator: (value: mongoose.Types.ObjectId[]) => value.length > 0, message: "Evidence is required." },
    },
    status: { type: String, enum: ["OPEN", "UNDER_REVIEW", "RESOLVED"], required: true, default: "OPEN" },
    revision: { type: Number, required: true, min: 0, default: 0, validate: Number.isSafeInteger },
  },
  { timestamps: true },
);
SettlementIncidentSchema.index({ payableId: 1, createdAt: -1, _id: -1 });
SettlementIncidentSchema.index({ status: 1, createdAt: -1, _id: -1 });

const SettlementIncident: Model<ISettlementIncident> =
  mongoose.models.SettlementIncident ||
  mongoose.model<ISettlementIncident>("SettlementIncident", SettlementIncidentSchema);

export default SettlementIncident;
