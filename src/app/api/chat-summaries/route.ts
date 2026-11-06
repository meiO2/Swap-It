import { NextResponse } from "next/server";
import { ensureMockDataSeeded } from "@/lib/mock-seed";
import MockChatSummary from "@/models/MockChatSummary";

export async function GET() {
  try {
    await ensureMockDataSeeded();
    const chats = await MockChatSummary.find({ isActive: true }).sort({ createdAt: 1 }).lean();
    return NextResponse.json({
      success: true,
      data: chats.map(({ chatId, name, avatar, lastMessage, time, unread }) => ({
        id: chatId,
        name,
        avatar,
        lastMessage,
        time,
        unread,
      })),
    });
  } catch (error) {
    console.error("Get chat summaries error:", error);
    return NextResponse.json({ success: false, message: "Could not load chat summaries." }, { status: 500 });
  }
}
