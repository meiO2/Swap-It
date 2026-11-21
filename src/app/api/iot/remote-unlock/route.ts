import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import { authenticateHubDevice } from "@/lib/hub-device-auth";
import HubDeviceSession from "@/models/HubDeviceSession";
import Donation from "@/models/Donation";

class RemoteUnlockConflict extends Error {}

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const device = await authenticateHubDevice(request);
    if (!device) return NextResponse.json({ success: false, message: "Invalid device credentials." }, { status: 401 });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, message: "Invalid JSON." }, { status: 400 });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ success: false, message: "Invalid request." }, { status: 400 });
    }
    const input = body as Record<string, unknown>;
    if (input.action === "CLAIM") {
      const now = new Date();
      const session = await HubDeviceSession.findOneAndUpdate({
        deviceId: device.deviceId,
        hubId: device.hubId,
        state: "AUTHORIZED",
        "remoteUnlock.status": "PENDING",
        "remoteUnlock.expiresAt": { $gt: now },
      }, {
        $set: { "remoteUnlock.status": "CLAIMED" },
      }, { new: true, sort: { createdAt: 1 } }).lean();
      if (!session?.remoteUnlock) {
        return NextResponse.json({ success: true, action: "NONE" });
      }
      return NextResponse.json({
        success: true,
        action: "UNLOCK",
        data: {
          sessionId: session._id.toString(),
          validForMs: Math.max(0, session.remoteUnlock.expiresAt.getTime() - Date.now()),
        },
      });
    }
    if (input.action === "RELAY_ACTIVATED" &&
        typeof input.sessionId === "string" && mongoose.isValidObjectId(input.sessionId)) {
      const sessionId = new mongoose.Types.ObjectId(input.sessionId);
      const transaction = await mongoose.startSession();
      try {
        await transaction.withTransaction(async () => {
          const session = await HubDeviceSession.findOneAndUpdate({
            _id: sessionId,
            deviceId: device.deviceId,
            hubId: device.hubId,
            activity: "DONATION",
            "remoteUnlock.status": "CLAIMED",
            "remoteUnlock.expiresAt": { $gt: new Date() },
          }, { $set: { "remoteUnlock.status": "RELAY_ACTIVATED" } }, { new: true, session: transaction }).lean();
          if (!session?.donationSessionId) {
            const acknowledged = await HubDeviceSession.exists({
              _id: sessionId,
              deviceId: device.deviceId,
              hubId: device.hubId,
              "remoteUnlock.status": "RELAY_ACTIVATED",
            }).session(transaction);
            if (acknowledged) return;
            throw new RemoteUnlockConflict();
          }
          const donation = await Donation.findOneAndUpdate({
            sessionId: session.donationSessionId,
            hubId: device.hubId,
            status: "SESSION_CREATED",
            "remoteUnlockPending.sessionId": sessionId,
          }, {
            $set: { status: "QR_SCANNED" },
            $unset: { remoteUnlockPending: 1 },
          }, { new: true, session: transaction }).lean();
          if (!donation) throw new RemoteUnlockConflict();
        });
      } catch (error) {
        if (error instanceof RemoteUnlockConflict) {
          return NextResponse.json({ success: false, message: "Command or donation session is no longer active." }, { status: 409 });
        }
        throw error;
      } finally {
        await transaction.endSession();
      }
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ success: false, message: "Invalid action." }, { status: 400 });
  } catch (error) {
    console.error("Hub remote unlock error:", error);
    return NextResponse.json({ success: false, message: "Could not process remote unlock." }, { status: 500 });
  }
}
