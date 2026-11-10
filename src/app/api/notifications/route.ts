import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/authorization";
import { connectDB } from "@/lib/mongodb";
import Notification from "@/models/Notification";

function getNotificationKind(type: string) {
  switch (type) {
    case "NEW_CONVERSATION":
      return "message";

    case "QC_UPDATE":
      return "qc";

    case "REVAMP_UPDATE":
      return "revamp";

    case "DONATION_DELIVERED":
      return "donation";

    case "SWAP_MATCH":
      return "match";

    case "ITEM_SHIPPED":
    case "ITEM_ARRIVED":
    case "ORDER_UPDATE":
    default:
      return "order";
  }
}

export async function GET() {
  try {
    const auth = await requireAuth();
    if (!auth.success) return auth.response;

    await connectDB();

    const notifications = await Notification.find({
      recipientId: new mongoose.Types.ObjectId(auth.user.id),
    })
      .populate("senderId", "name avatarUrl")
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    return NextResponse.json({
      success: true,
      data: notifications.map((notification) => {
        const sender = notification.senderId as unknown as {
          _id: mongoose.Types.ObjectId;
          name?: string;
          avatarUrl?: string;
        } | null;

        return {
          id: notification._id.toString(),
          title: notification.title,
          detail: notification.message,
          createdAt:
            notification.createdAt?.toISOString() ??
            new Date(0).toISOString(),
          href: notification.link ?? "/notifications",
          kind: getNotificationKind(notification.type),
          isRead: notification.isRead,
          sender: sender?._id
            ? {
                id: sender._id.toString(),
                name: sender.name ?? "SwapIt user",
                avatarUrl: sender.avatarUrl ?? null,
              }
            : null,
        };
      }),
    });
  } catch (error) {
    console.error("Get notifications error:", error);
    return NextResponse.json(
      { success: false, message: "Could not load notifications." },
      { status: 500 },
    );
  }
}


export async function PATCH(request: Request) {
  try {
    const auth = await requireAuth();
    if (!auth.success) return auth.response;

    await connectDB();

    const body = await request.json();

    const recipientId = new mongoose.Types.ObjectId(auth.user.id);

    // Mark all notifications as read.
    if (body.markAllRead === true) {
      await Notification.updateMany(
        {
          recipientId,
          isRead: false,
        },
        {
          $set: {
            isRead: true,
            readAt: new Date(),
          },
        }
      );

      return NextResponse.json({
        success: true,
        message: "All notifications marked as read.",
        data: null,
      });
    }

    // Mark one notification as read.
    if (
      typeof body.id !== "string" ||
      !mongoose.isValidObjectId(body.id)
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid notification ID." },
        { status: 400 }
      );
    }

    const result = await Notification.updateOne(
      {
        _id: new mongoose.Types.ObjectId(body.id),
        recipientId,
      },
      {
        $set: {
          isRead: true,
          readAt: new Date(),
        },
      }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { success: false, message: "Notification not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Notification marked as read.",
      data: null,
    });
  } catch (error) {
    console.error("Update notification error:", error);

    return NextResponse.json(
      { success: false, message: "Could not update notification." },
      { status: 500 }
    );
  }
}
