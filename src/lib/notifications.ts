
    import { Types, type ClientSession } from "mongoose";

    import { connectDB } from "@/lib/mongodb";
    import Notification, {
    type NotificationType,
    } from "@/models/Notification";

    export type CreateNotificationInput = {
    recipientId: string;
    senderId?: string | null;
    type: NotificationType;
    title: string;
    message: string;
    link?: string | null;
    };

    export type CreateMultipleNotificationsInput = {
    recipientIds: string[];
    senderId?: string | null;
    type: NotificationType;
    title: string;
    message: string;
    link?: string | null;
    session?: ClientSession;
    };

    export async function createNotification(
    input: CreateNotificationInput
    ) {
    if (!Types.ObjectId.isValid(input.recipientId)) {
        throw new Error("Invalid notification recipient ID.");
    }

    if (input.senderId && !Types.ObjectId.isValid(input.senderId)) {
        throw new Error("Invalid notification sender ID.");
    }

    await connectDB();

    return Notification.create({
        recipientId: new Types.ObjectId(input.recipientId),
        senderId: input.senderId
        ? new Types.ObjectId(input.senderId)
        : null,
        type: input.type,
        title: input.title,
        message: input.message,
        link: input.link ?? null,
        isRead: false,
        readAt: null,
    });
    }

    export async function createNotificationsForMany(
    input: CreateMultipleNotificationsInput
    ) {
    const recipientIds = [...new Set(input.recipientIds)];

    if (recipientIds.length === 0) return [];

    if (recipientIds.some((id) => !Types.ObjectId.isValid(id))) {
        throw new Error("One or more notification recipient IDs are invalid.");
    }

    if (input.senderId && !Types.ObjectId.isValid(input.senderId)) {
        throw new Error("Invalid notification sender ID.");
    }

    await connectDB();

    return Notification.insertMany(
        recipientIds.map((recipientId) => ({
        recipientId: new Types.ObjectId(recipientId),
        senderId: input.senderId
            ? new Types.ObjectId(input.senderId)
            : null,
        type: input.type,
        title: input.title,
        message: input.message,
        link: input.link ?? null,
        isRead: false,
        readAt: null,
        })),
        input.session ? { session: input.session } : {}
    );
    }
