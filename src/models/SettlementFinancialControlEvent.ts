import mongoose, { Model, Schema } from "mongoose";
import { enforceAppendOnly } from "./append-only.ts";

export interface ISettlementFinancialControlEvent {
  holdId: mongoose.Types.ObjectId;
  action: "CREATED" | "RESOLVED";
  actorType: "ADMIN" | "SYSTEM";
  actorId?: mongoose.Types.ObjectId;
  reason: string;
  evidenceIds: mongoose.Types.ObjectId[];
  occurredAt: Date;
  idempotencyKey?: string;
}

const SettlementFinancialControlEventSchema =
  new Schema<ISettlementFinancialControlEvent>(
    {
      holdId: { type: Schema.Types.ObjectId, ref: "SettlementFinancialHold", required: true },
      action: { type: String, enum: ["CREATED", "RESOLVED"], required: true },
      actorType: { type: String, enum: ["ADMIN", "SYSTEM"], required: true },
      actorId: { type: Schema.Types.ObjectId, ref: "User" },
      reason: { type: String, required: true, trim: true, maxlength: 1000 },
      evidenceIds: [{ type: Schema.Types.ObjectId, ref: "SettlementEvidence" }],
      occurredAt: { type: Date, required: true },
      idempotencyKey: { type: String, trim: true, maxlength: 200 },
    },
    { timestamps: { createdAt: true, updatedAt: false } },
  );
SettlementFinancialControlEventSchema.pre("validate", function () {
  if (this.actorType === "ADMIN" && !this.actorId) {
    this.invalidate("actorId", "An ADMIN event requires an actor.");
  }
  if (this.action === "RESOLVED" && (this.actorType !== "ADMIN" || !this.evidenceIds?.length)) {
    this.invalidate("action", "Resolving a hold requires an ADMIN and evidence.");
  }
});
enforceAppendOnly(SettlementFinancialControlEventSchema, "Settlement financial control event");
SettlementFinancialControlEventSchema.index({ holdId: 1, occurredAt: -1, _id: -1 });
SettlementFinancialControlEventSchema.index(
  { holdId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } } },
);

const SettlementFinancialControlEvent: Model<ISettlementFinancialControlEvent> =
  mongoose.models.SettlementFinancialControlEvent ||
  mongoose.model<ISettlementFinancialControlEvent>(
    "SettlementFinancialControlEvent",
    SettlementFinancialControlEventSchema,
  );

export default SettlementFinancialControlEvent;
