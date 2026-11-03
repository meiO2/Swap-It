
    import mongoose, { Schema, Model } from "mongoose";

    export type OTPPurpose = "REGISTER" | "FORGOT_PASSWORD";

    export interface IOTP {
    email: string;
    codeHash: string;
    purpose: OTPPurpose;
    attempts: number;
    maxAttempts: number;
    expiresAt: Date;
    consumedAt?: Date;
    }

    const OTPSchema = new Schema<IOTP>(
    {
        email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
        index: true,
        },

        codeHash: {
        type: String,
        required: true,
        select: false,
        },

        purpose: {
        type: String,
        enum: ["REGISTER", "FORGOT_PASSWORD"],
        required: true,
        },

        attempts: {
        type: Number,
        default: 0,
        min: 0,
        },

        maxAttempts: {
        type: Number,
        default: 5,
        min: 1,
        },

        expiresAt: {
        type: Date,
        required: true,
        },

        consumedAt: {
        type: Date,
        default: null,
        },
    },
    {
        timestamps: true,
    }
    );

    // Automatically delete expired OTP records.
    OTPSchema.index(
    { expiresAt: 1 },
    { expireAfterSeconds: 0 }
    );

    // Efficiently find an OTP for an email and purpose.
    OTPSchema.index({
    email: 1,
    purpose: 1,
    createdAt: -1,
    });

    const OTP: Model<IOTP> =
    mongoose.models.OTP ||
    mongoose.model<IOTP>("OTP", OTPSchema);

    export default OTP;
