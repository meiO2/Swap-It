import mongoose, { Model, Schema } from "mongoose";

export interface ISettlementOrderFence {
  _id: mongoose.Types.ObjectId;
  revision: number;
}

const SettlementOrderFenceSchema = new Schema<ISettlementOrderFence>(
  {
    _id: { type: Schema.Types.ObjectId, ref: "Order", required: true },
    revision: {
      type: Number,
      required: true,
      min: 0,
      validate: Number.isSafeInteger,
    },
  },
  { versionKey: false },
);

const SettlementOrderFence: Model<ISettlementOrderFence> =
  mongoose.models.SettlementOrderFence ||
  mongoose.model<ISettlementOrderFence>("SettlementOrderFence", SettlementOrderFenceSchema);

export default SettlementOrderFence;
