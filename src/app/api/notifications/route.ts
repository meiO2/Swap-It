import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/authorization";
import { connectDB } from "@/lib/mongodb";
import Notification from "@/models/Notification";

export async function GET() {
  try {
    const auth = await requireAuth();
    if (!auth.success) return auth.response;

    await connectDB();
    const notifications = await Notification.find({
      recipientId: new mongoose.Types.ObjectId(auth.user.id),
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    return NextResponse.json({
      success: true,
      data: notifications.map((notification) => ({
        id: notification._id.toString(),
        title: notification.title,
        detail: notification.message,
        createdAt: notification.createdAt?.toISOString() ?? new Date(0).toISOString(),
        href: notification.link ?? "/notifications",
        kind: notification.type === "QC_UPDATE" ? "qc" : "order",
      })),
    });
  } catch (error) {
    console.error("Get notifications error:", error);
    return NextResponse.json(
      { success: false, message: "Could not load notifications." },
      { status: 500 },
    );
  }
}
