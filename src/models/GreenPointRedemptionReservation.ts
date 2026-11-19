import mongoose, { Model, Schema } from "mongoose";

export type GreenPointRedemptionReservationStatus =
  | "PENDING"
  | "CONSUMED"
  | "RELEASED";

export interface IGreenPointRedemptionReservation {
  orderId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  amount: number;
  status: GreenPointRedemptionReservationStatus;
  referenceKey: string;
  consumedAt?: Date;
  releasedAt?: Date;
}

const GreenPointRedemptionReservationSchema =
  new Schema<IGreenPointRedemptionReservation>(
    {
      orderId: {
        type: Schema.Types.ObjectId,
        ref: "Order",
        required: true,
        unique: true,
      },
      userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
      },
      amount: { type: Number, required: true, min: 1 },
      status: {
        type: String,
        enum: ["PENDING", "CONSUMED", "RELEASED"],
        required: true,
        default: "PENDING",
        index: true,
      },
      referenceKey: { type: String, required: true, unique: true, index: true },
      consumedAt: Date,
      releasedAt: Date,
    },
    { timestamps: true },
  );

const GreenPointRedemptionReservation: Model<IGreenPointRedemptionReservation> =
  mongoose.models.GreenPointRedemptionReservation ||
  mongoose.model<IGreenPointRedemptionReservation>(
    "GreenPointRedemptionReservation",
    GreenPointRedemptionReservationSchema,
  );

export default GreenPointRedemptionReservation;
