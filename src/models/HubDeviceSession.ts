
    import mongoose, { Model, Schema } from "mongoose";

    export type HubSessionActivity = "DONATION" | "SELLER_HANDOVER";

    export type HubSessionState =
    | "AUTHORIZED"
    | "DOOR_UNLOCKED"
    | "DOOR_OPEN"
    | "ITEM_DETECTED"
    | "DOOR_CLOSED"
    | "DOOR_LOCKED"
    | "COMPLETED"
    | "FAILED";

    export interface IHubDeviceSession {
    deviceId: string;
    hubId: string;
    accessTokenId: mongoose.Types.ObjectId;

    activity: HubSessionActivity;

    donationSessionId?: string;
    orderId?: string;
    productId?: string;

    state: HubSessionState;
    itemDetected: boolean;

    events: {
        event: string;
        occurredAt: Date;
        receivedAt: Date;
    }[];

    createdAt?: Date;
    updatedAt?: Date;
    }

    const HubDeviceSessionSchema = new Schema<IHubDeviceSession>(
    {
        deviceId: {
        type: String,
        required: true,
        index: true,
        },
        hubId: {
        type: String,
        required: true,
        index: true,
        },
        accessTokenId: {
        type: Schema.Types.ObjectId,
        ref: "HubAccessToken",
        required: true,
        unique: true,
        },
        activity: {
        type: String,
        enum: ["DONATION", "SELLER_HANDOVER"],
        required: true,
        },
        donationSessionId: String,
        orderId: String,
        productId: String,
        state: {
        type: String,
        enum: [
            "AUTHORIZED",
            "DOOR_UNLOCKED",
            "DOOR_OPEN",
            "ITEM_DETECTED",
            "DOOR_CLOSED",
            "DOOR_LOCKED",
            "COMPLETED",
            "FAILED",
        ],
        default: "AUTHORIZED",
        required: true,
        index: true,
        },
        itemDetected: {
        type: Boolean,
        default: false,
        required: true,
        },
        events: [
        {
            event: {
            type: String,
            required: true,
            },
            occurredAt: {
            type: Date,
            required: true,
            },
            receivedAt: {
            type: Date,
            default: Date.now,
            required: true,
            },
        },
        ],
    },
    { timestamps: true }
    );

    HubDeviceSessionSchema.index({ deviceId: 1, state: 1 });

    const HubDeviceSession: Model<IHubDeviceSession> =
    mongoose.models.HubDeviceSession ||
    mongoose.model<IHubDeviceSession>(
        "HubDeviceSession",
        HubDeviceSessionSchema
    );

    export default HubDeviceSession;
