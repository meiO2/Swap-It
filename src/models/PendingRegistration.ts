
    import mongoose, { Schema, Model } from "mongoose";

    export interface IPendingRegistration {
    name: string;
    email: string;
    passwordHash: string;
    expiresAt: Date;
    }

    const PendingRegistrationSchema =
    new Schema<IPendingRegistration>(
        {
        name: {
            type: String,
            required: true,
            trim: true,
        },

        email: {
            type: String,
            required: true,
            lowercase: true,
            trim: true,
            unique: true,
        },

        passwordHash: {
            type: String,
            required: true,
            select: false,
        },

        expiresAt: {
            type: Date,
            required: true,
        },
        },
        {
        timestamps: true,
        }
    );

    // Automatically remove expired pending registrations.
    PendingRegistrationSchema.index(
    { expiresAt: 1 },
    { expireAfterSeconds: 0 }
    );

    const PendingRegistration: Model<IPendingRegistration> =
    mongoose.models.PendingRegistration ||
    mongoose.model<IPendingRegistration>(
        "PendingRegistration",
        PendingRegistrationSchema
    );

    export default PendingRegistration;
