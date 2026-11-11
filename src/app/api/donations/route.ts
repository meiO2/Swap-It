import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { requireAuth } from "@/lib/authorization";
import { getSwapHubs } from "@/lib/hubs";
import Donation from "@/models/Donation";

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  let requestSessionId: string | null = null;
  let requestHubId: string | null = null;

  try {
    await connectDB();

    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ success: false, message: "Invalid donation session details." }, { status: 400 });
    }

    const { hubId, sessionId } = body as Record<string, unknown>;
    if (typeof hubId !== "string" || !hubId.trim()) {
      return NextResponse.json({ success: false, message: "A valid hubId is required." }, { status: 400 });
    }
    if (typeof sessionId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)) {
      return NextResponse.json({ success: false, message: "Invalid donation session key." }, { status: 400 });
    }

    requestSessionId = sessionId;
    requestHubId = hubId.trim();
    const hubs = await getSwapHubs();
    if (!hubs.some((hub) => hub.id === requestHubId)) {
      return NextResponse.json({ success: false, message: "The selected Swap Hub is unavailable." }, { status: 404 });
    }

    const existing = await Donation.findOne({ sessionId }).lean();
    if (existing) {
      if (existing.userId.toString() !== auth.user.id || existing.hubId !== requestHubId) {
        return NextResponse.json({ success: false, message: "Donation session key is already in use." }, { status: 409 });
      }
      return NextResponse.json({
        success: true,
        message: "Donation session already exists.",
        data: existing,
      });
    }

    const donation = await Donation.findOneAndUpdate(
      { sessionId, userId: auth.user.id, hubId: requestHubId },
      {
        $setOnInsert: {
          userId: auth.user.id,
          hubId: requestHubId,
          sessionId,
          totalItems: 0,
          acceptedItems: 0,
          rejectedItems: 0,
          gpAwarded: 0,
          status: "SESSION_CREATED",
        },
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    );

    return NextResponse.json(
      { success: true, message: "Donation session created successfully.", data: donation },
      { status: 201 },
    );
  } catch (error) {
    if (isDuplicateKeyError(error) && requestSessionId && requestHubId) {
      try {
        const existing = await Donation.findOne({ sessionId: requestSessionId }).lean();
        if (existing?.userId.toString() === auth.user.id && existing.hubId === requestHubId) {
          return NextResponse.json({
            success: true,
            message: "Donation session already exists.",
            data: existing,
          });
        }
        return NextResponse.json({ success: false, message: "Donation session key is already in use." }, { status: 409 });
      } catch (lookupError) {
        console.error("Could not verify an existing donation session:", lookupError);
      }
    }

    console.error("Create donation error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to create donation session." },
      { status: 500 },
    );
  }
}

export async function GET() {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  try {
    await connectDB();

    const isAdmin = ["ADMIN", "INSPECTOR"].includes(auth.user.role);
    const query = isAdmin ? {} : { userId: auth.user.id };
    const donationQuery = Donation.find(query).sort({ createdAt: -1 });
    if (isAdmin) donationQuery.populate("userId", "name email phone");

    const donations = await donationQuery.lean();
    return NextResponse.json({
      success: true,
      count: donations.length,
      data: donations,
    });
  } catch (error) {
    console.error("Get donations error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to retrieve donations." },
      { status: 500 },
    );
  }
}
