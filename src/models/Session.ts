    import mongoose, { Schema, Model } from "mongoose";

    export interface ISession {
    userId: mongoose.Types.ObjectId;
    tokenHash: string;
    expiresAt: Date;
    }

    const SessionSchema = new Schema<ISession>(
    {
        userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
        },

        tokenHash: {
        type: String,
        required: true,
        unique: true,
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

    // Automatically remove expired sessions.
    SessionSchema.index(
    { expiresAt: 1 },
    { expireAfterSeconds: 0 }
    );

    const Session: Model<ISession> =
    mongoose.models.Session ||
    mongoose.model<ISession>("Session", SessionSchema);

    export default Session;