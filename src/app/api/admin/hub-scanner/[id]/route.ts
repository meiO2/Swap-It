import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { requireRole } from "@/lib/authorization";
import { connectDB } from "@/lib/mongodb";
import HubDeviceSession from "@/models/HubDeviceSession";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["ADMIN"]);
  if (!auth.success) return auth.response;
  const { id } = await context.params;
  if (!mongoose.isValidObjectId(id)) {
    return NextResponse.json({ success: false, message: "Invalid session." }, { status: 400 });
  }
  const deviceId = process.env.HUB_SCANNER_DEVICE_ID;
  if (!deviceId) {
    return NextResponse.json({ success: false, message: "Hub scanner device is not configured." }, { status: 503 });
  }
  try {
    await connectDB();
    const session = await HubDeviceSession.findOne({ _id: id, deviceId }).select("remoteUnlock").lean();
    if (!session?.remoteUnlock) {
      return NextResponse.json({ success: false, message: "Scanner session not found." }, { status: 404 });
    }
    const { status, expiresAt } = session.remoteUnlock;
    return NextResponse.json({
      success: true,
      data: { status: status === "PENDING" && expiresAt.getTime() <= Date.now() ? "EXPIRED" : status },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Hub scanner status error:", error);
    return NextResponse.json({ success: false, message: "Could not check scanner status." }, { status: 500 });
  }
}
