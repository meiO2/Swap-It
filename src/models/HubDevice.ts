
    import mongoose, { Model, Schema } from "mongoose";

    export type HubDeviceStatus = "ACTIVE" | "INACTIVE";

    export interface IHubDevice {
    deviceId: string;
    hubId: string;
    apiKeyHash: string;
    status: HubDeviceStatus;
    lastSeenAt?: Date;
    createdAt?: Date;
    updatedAt?: Date;
    }

    const HubDeviceSchema = new Schema<IHubDevice>(
    {
        deviceId: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        index: true,
        },

        hubId: {
        type: String,
        required: true,
        trim: true,
        index: true,
        },

        apiKeyHash: {
        type: String,
        required: true,
        select: false,
        },

        status: {
        type: String,
        enum: ["ACTIVE", "INACTIVE"],
        default: "ACTIVE",
        required: true,
        index: true,
        },

        lastSeenAt: {
        type: Date,
        },
    },
    {
        timestamps: true,
    },
    );

    HubDeviceSchema.index({ hubId: 1, status: 1 });

    const HubDevice: Model<IHubDevice> =
    mongoose.models.HubDevice ||
    mongoose.model<IHubDevice>("HubDevice", HubDeviceSchema);

    export default HubDevice;
