
    import mongoose, { Schema, Model } from "mongoose";

    export interface IDonation {
    userId: mongoose.Types.ObjectId;
    hubId: string;
    sessionId: string;
    totalItems: number;
    acceptedItems: number;
    rejectedItems: number;
    resaleQualityItems: number;
    upcyclingQualityItems: number;
    socialDonationItems: number;
    gpAwarded: number;
    status: "SESSION_CREATED" | "QR_SCANNED" | "UNDER_VERIFICATION" | "REWARD_GRANTED" | "DEPOSITING" | "COMPLETED" | "DISCREPANCY_REVIEW" | "PENDING" | "CANCELLED";
    confirmedAt?: Date;
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
        enum: ["SESSION_CREATED", "QR_SCANNED", "UNDER_VERIFICATION", "REWARD_GRANTED", "DEPOSITING", "COMPLETED", "DISCREPANCY_REVIEW", "PENDING", "CANCELLED"],
        default: "SESSION_CREATED",
        },

        confirmedAt: {
        type: Date,
        },
    },
    {
        timestamps: true,
    }
    );

    const Donation: Model<IDonation> =
    mongoose.models.Donation ||
    mongoose.model<IDonation>("Donation", DonationSchema);

    export default Donation;
