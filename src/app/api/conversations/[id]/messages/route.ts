
    import { NextRequest, NextResponse } from "next/server";
    import mongoose, { Types } from "mongoose";

    import { connectDB } from "@/lib/mongodb";
    import { getCurrentUser } from "@/lib/session";
    import Conversation from "@/models/Conversation";
    import Message from "@/models/Message";
    import { createNotificationsForMany } from "@/lib/notifications";

    // GET: Retrieve messages and mark incoming messages as read.
    export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
    ) {
    try {
        await connectDB();

        const currentUser = await getCurrentUser();

        if (!currentUser) {
        return NextResponse.json(
            { success: false, message: "Unauthorized. Please log in." },
            { status: 401 }
        );
        }

        const { id } = await params;

        if (!mongoose.isValidObjectId(id)) {
        return NextResponse.json(
            { success: false, message: "Invalid conversation ID." },
            { status: 400 }
        );
        }

        const conversation = await Conversation.findOne({
        _id: id,
        participants: new Types.ObjectId(currentUser.id),
        });

        if (!conversation) {
        return NextResponse.json(
            { success: false, message: "Conversation not found." },
            { status: 404 }
        );
        }

        // Mark messages from the other participant as read.
        await Message.updateMany(
        {
            conversationId: conversation._id,
            senderId: { $ne: new Types.ObjectId(currentUser.id) },
            readAt: null,
        },
        {
            $set: { readAt: new Date() },
        }
        );

        const messages = await Message.find({
        conversationId: conversation._id,
        })
        .populate("senderId", "name avatarUrl")
        .sort({ createdAt: 1 })
        .lean();

        return NextResponse.json(
        {
            success: true,
            data: messages,
        },
        { status: 200 }
        );
    } catch (error) {
        console.error("Get messages error:", error);

        return NextResponse.json(
        { success: false, message: "Failed to retrieve messages." },
        { status: 500 }
        );
    }
    }

    // POST: Send a message.
    export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
    ) {
    try {
        await connectDB();

        const currentUser = await getCurrentUser();

        if (!currentUser) {
        return NextResponse.json(
            { success: false, message: "Unauthorized. Please log in." },
            { status: 401 }
        );
        }

        const { id } = await params;

        if (!mongoose.isValidObjectId(id)) {
        return NextResponse.json(
            { success: false, message: "Invalid conversation ID." },
            { status: 400 }
        );
        }

        const conversation = await Conversation.findOne({
        _id: id,
        participants: new Types.ObjectId(currentUser.id),
        });

        if (!conversation) {
        return NextResponse.json(
            { success: false, message: "Conversation not found." },
            { status: 404 }
        );
        }

        const body = await request.json();
        const text = typeof body.text === "string" ? body.text.trim() : "";

        if (!text) {
        return NextResponse.json(
            { success: false, message: "Message cannot be empty." },
            { status: 400 }
        );
        }

        if (text.length > 5000) {
        return NextResponse.json(
            { success: false, message: "Message cannot exceed 5000 characters." },
            { status: 400 }
        );
        }

        const message = await Message.create({
        conversationId: conversation._id,
        senderId: new Types.ObjectId(currentUser.id),
        text,
        });

        // Update the conversation preview and activity timestamp.
        conversation.lastMessage = text;
        conversation.lastMessageAt = new Date();
        await conversation.save();

        // Notify all other participants about the new message.
        const recipientIds = conversation.participants
        .map((participant) => participant.toString())
        .filter((participantId) => participantId !== currentUser.id);

        if (recipientIds.length > 0) {
        try {
            await createNotificationsForMany({
            recipientIds,
            senderId: currentUser.id,
            type: "NEW_CONVERSATION",
            title: "New message",
            message:
                text.length > 100 ? `${text.slice(0, 100)}...` : text,
            link: `/chat/${id}`,
            });
        } catch (notificationError) {
            // A notification failure must not prevent message delivery.
            console.error(
            "Could not create chat notification:",
            notificationError
            );
        }
        }

        const populatedMessage = await Message.findById(message._id)
        .populate("senderId", "name avatarUrl")
        .lean();

        return NextResponse.json(
        {
            success: true,
            message: "Message sent successfully.",
            data: populatedMessage,
        },
        { status: 201 }
        );
    } catch (error) {
        console.error("Send message error:", error);

        return NextResponse.json(
        { success: false, message: "Failed to send message." },
        { status: 500 }
        );
    }
    }
