
    import mongoose, { Schema, Model, Types } from "mongoose";

    export type NotificationType =
    | "ITEM_SHIPPED"
    | "ITEM_ARRIVED"
    | "ORDER_UPDATE"
    | "QC_UPDATE"
    | "REVAMP_UPDATE"
    | "DONATION_DELIVERED"
    | "SWAP_MATCH"
    | "NEW_CONVERSATION";

    export interface INotification {
    recipientId: Types.ObjectId;
    senderId?: Types.ObjectId | null;
    type: NotificationType;
    title: string;
    message: string;
    link?: string | null;
    isRead: boolean;
    readAt?: Date | null;
    }

    const NotificationSchema = new Schema<INotification>(
    {
        recipientId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
        },

        senderId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        default: null,
        },

        type: {
        type: String,
        enum: [
            "ITEM_SHIPPED",
            "ITEM_ARRIVED",
            "ORDER_UPDATE",
            "QC_UPDATE",
            "REVAMP_UPDATE",
            "DONATION_DELIVERED",
            "SWAP_MATCH",
            "NEW_CONVERSATION",
        ],
        required: true,
        },

        title: {
        type: String,
        required: true,
        trim: true,
        },

        message: {
        type: String,
        required: true,
        trim: true,
        },

        link: {
        type: String,
        default: null,
        },

        isRead: {
        type: Boolean,
        default: false,
        },

        readAt: {
        type: Date,
        default: null,
        },
    },
    {
        timestamps: true,
    }
    );

    // Retrieve a user's notifications, newest first.
    NotificationSchema.index({
    recipientId: 1,
    createdAt: -1,
    });

    // Efficiently retrieve unread notifications.
    NotificationSchema.index({
    recipientId: 1,
    isRead: 1,
    });

    const Notification: Model<INotification> =
    mongoose.models.Notification ||
    mongoose.model<INotification>("Notification", NotificationSchema);

    export default Notification;
