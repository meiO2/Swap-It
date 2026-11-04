
    import { NextRequest, NextResponse } from "next/server";
    import mongoose, { Types } from "mongoose";

    import { connectDB } from "@/lib/mongodb";
    import { getCurrentUser } from "@/lib/session";
    import Conversation from "@/models/Conversation";
    import User from "@/models/User";

    // GET: Retrieve all conversations belonging to the logged-in user.
    export async function GET() {
    try {
        await connectDB();

        const currentUser = await getCurrentUser();

        if (!currentUser) {
        return NextResponse.json(
            { success: false, message: "Unauthorized. Please log in." },
            { status: 401 }
        );
        }

        const conversations = await Conversation.find({
        participants: new Types.ObjectId(currentUser.id),
        })
        .populate("participants", "name email avatarUrl")
        .sort({ lastMessageAt: -1, updatedAt: -1 })
        .lean();

        return NextResponse.json(
        {
            success: true,
            data: conversations,
        },
        { status: 200 }
        );
    } catch (error) {
        console.error("Get conversations error:", error);

        return NextResponse.json(
        { success: false, message: "Failed to retrieve conversations." },
        { status: 500 }
        );
    }
    }

    // POST: Find an existing conversation or create a new one.
    export async function POST(request: NextRequest) {
    try {
        await connectDB();

        const currentUser = await getCurrentUser();

        if (!currentUser) {
        return NextResponse.json(
            { success: false, message: "Unauthorized. Please log in." },
            { status: 401 }
        );
        }

        const body = await request.json();
        const { recipientId } = body;

        // Validate the recipient ID.
        if (!recipientId || !mongoose.isValidObjectId(recipientId)) {
        return NextResponse.json(
            { success: false, message: "A valid recipient ID is required." },
            { status: 400 }
        );
        }

        // Prevent users from starting a conversation with themselves.
        if (recipientId === currentUser.id) {
        return NextResponse.json(
            { success: false, message: "You cannot message yourself." },
            { status: 400 }
        );
        }

        // Make sure the recipient exists and is active.
        const recipient = await User.findOne({
        _id: recipientId,
        isActive: true,
        }).select("_id name email avatarUrl");

        if (!recipient) {
        return NextResponse.json(
            { success: false, message: "Recipient not found." },
            { status: 404 }
        );
        }

        // Sort IDs so A -> B and B -> A produce the same key.
        const participantIds = [
        currentUser.id,
        recipient._id.toString(),
        ].sort();

        const participantKey = participantIds.join("_");

        // Reuse the conversation if it already exists.
        // Otherwise, create it.
        let conversation;

        try {
        conversation = await Conversation.findOneAndUpdate(
            { participantKey },
            {
            $setOnInsert: {
                participants: participantIds.map(
                (id) => new Types.ObjectId(id)
                ),
                participantKey,
            },
            },
            {
            new: true,
            upsert: true,
            runValidators: true,
            }
        ).populate("participants", "name email avatarUrl");
        } catch (error: unknown) {
        // Handle simultaneous requests that attempt to create
        // the same conversation.
        if (
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            error.code === 11000
        ) {
            conversation = await Conversation.findOne({
            participantKey,
            }).populate("participants", "name email avatarUrl");
        } else {
            throw error;
        }
        }

        if (!conversation) {
        return NextResponse.json(
            { success: false, message: "Failed to create conversation." },
            { status: 500 }
        );
        }

        return NextResponse.json(
        {
            success: true,
            message: "Conversation retrieved successfully.",
            data: conversation,
        },
        { status: 200 }
        );
    } catch (error) {
        console.error("Create conversation error:", error);

        return NextResponse.json(
        { success: false, message: "Failed to create conversation." },
        { status: 500 }
        );
    }
    }
