import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { requireAuth } from "@/lib/authorization";
import { connectDB } from "@/lib/mongodb";
import Donation from "@/models/Donation";
import { awardGreenPoints, GREEN_POINT_REWARDS } from "@/lib/green-points";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: RouteContext) {
  try {
    const auth = await requireAuth();
    if (!auth.success) return auth.response;
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: "Invalid donation ID." }, { status: 400 });
    }
    await connectDB();
    const body = await _request.json();
    const itemCount = body?.itemCount;
    if (!Number.isSafeInteger(itemCount) || itemCount < 1 || itemCount > 30) {
      return NextResponse.json({ success: false, message: "A valid donation item count is required." }, { status: 400 });
    }

    const completed = await Donation.findOne({
      _id: id,
      userId: auth.user.id,
      status: "COMPLETED",
    });
    if (completed) {
      return NextResponse.json({ success: true, data: completed });
    }

    const donation = await Donation.findOneAndUpdate(
      { _id: id, userId: auth.user.id, status: "PENDING" },
      {
        $set: {
          acceptedItems: itemCount,
          rejectedItems: 0,
          totalItems: itemCount,
          gpAwarded: itemCount * GREEN_POINT_REWARDS.donationTemporaryPerItem,
          status: "COMPLETED",
          confirmedAt: new Date(),
        },
      },
      { new: true, runValidators: true },
    );
    if (!donation) {
      return NextResponse.json({ success: false, message: "Donation was already completed or not found." }, { status: 409 });
    }

    await awardGreenPoints({
      userId: auth.user.id,
      amount: donation.gpAwarded,
      description: `Temporary donation reward for ${itemCount} item${itemCount === 1 ? "" : "s"}`,
      referenceKey: `donation:${donation._id.toString()}`,
    });
    return NextResponse.json({ success: true, data: donation });
  } catch (error) {
    console.error("Complete donation error:", error);
    return NextResponse.json({ success: false, message: "Failed to complete donation." }, { status: 500 });
  }
}
