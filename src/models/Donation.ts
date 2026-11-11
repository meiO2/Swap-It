import mongoose, { Schema, type Model } from "mongoose";

export type DonationStatus =
  | "SESSION_CREATED"
  | "QR_SCANNED"
  | "UNDER_VERIFICATION"
  | "REWARD_GRANTED"
  | "DEPOSITING"
  | "COMPLETED"
  | "DISCREPANCY_REVIEW"
  | "PENDING"
  | "CANCELLED";

export interface IDonation {
  userId: mongoose.Types.ObjectId;
  hubId: string;
  sessionId: string;
  donorReportedItems: number;
  totalItems: number;
  acceptedItems: number;
  rejectedItems: number;
  resaleQualityItems: number;
  upcyclingQualityItems: number;
  socialDonationItems: number;
  gpAwarded: number;
  status: DonationStatus;
  confirmedAt?: Date;
  verifiedAt?: Date;
  verifiedBy?: mongoose.Types.ObjectId;
  classificationHistory: {
    classifiedBy: mongoose.Types.ObjectId;
    classifiedAt: Date;
    resaleQualityItems: number;
    upcyclingQualityItems: number;
    socialDonationItems: number;
    rejectedItems: number;
    gpAwarded: number;
  }[];
}

const DonationSchema = new Schema<IDonation>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "User",
    },
    hubId: {
      type: String,
      required: true,
    },
    sessionId: {
      type: String,
      required: true,
      unique: true,
    },
    donorReportedItems: {
      type: Number,
      min: 0,
      max: 30,
      default: 0,
    },
    totalItems: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    acceptedItems: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    rejectedItems: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    resaleQualityItems: { type: Number, min: 0, default: 0 },
    upcyclingQualityItems: { type: Number, min: 0, default: 0 },
    socialDonationItems: { type: Number, min: 0, default: 0 },
    gpAwarded: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    status: {
      type: String,
      enum: [
        "SESSION_CREATED",
        "QR_SCANNED",
        "UNDER_VERIFICATION",
        "REWARD_GRANTED",
        "DEPOSITING",
        "COMPLETED",
        "DISCREPANCY_REVIEW",
        "PENDING",
        "CANCELLED",
      ],
      default: "SESSION_CREATED",
    },
    confirmedAt: Date,
    verifiedAt: Date,
    verifiedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    classificationHistory: {
      type: [{
        classifiedBy: {
          type: Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        classifiedAt: { type: Date, required: true },
        resaleQualityItems: { type: Number, min: 0, required: true },
        upcyclingQualityItems: { type: Number, min: 0, required: true },
        socialDonationItems: { type: Number, min: 0, required: true },
        rejectedItems: { type: Number, min: 0, required: true },
        gpAwarded: { type: Number, min: 0, required: true },
      }],
      default: [],
    },
  },
  { timestamps: true },
);

const Donation: Model<IDonation> =
  mongoose.models.Donation ||
  mongoose.model<IDonation>("Donation", DonationSchema);

export default Donation;
