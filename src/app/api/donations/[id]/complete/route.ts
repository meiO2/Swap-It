import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { requireAuth } from "@/lib/authorization";
import { connectDB } from "@/lib/mongodb";
import Donation from "@/models/Donation";

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

    const donation = await Donation.findOneAndUpdate(
      {
        _id: id,
        userId: auth.user.id,
        status: { $in: ["QR_SCANNED", "UNDER_VERIFICATION"] },
      },
      { $set: { donorReportedItems: itemCount } },
      { new: true, runValidators: true },
    );
    if (donation) {
      return NextResponse.json({
        success: true,
        message: "Item count recorded. The Hub must confirm the deposit before verification.",
        data: donation,
      });
    }

    const existing = await Donation.findOne({
      _id: id,
      userId: auth.user.id,
    });
    if (!existing) {
      return NextResponse.json({ success: false, message: "Donation not found." }, { status: 404 });
    }
    if (existing.status === "COMPLETED") {
      return NextResponse.json({ success: true, data: existing });
    }

    return NextResponse.json({
      success: false,
      message: `Item count cannot be recorded while donation status is ${existing.status}.`,
    }, { status: 409 });
  } catch (error) {
    console.error("Complete donation error:", error);
    return NextResponse.json({ success: false, message: "Failed to complete donation." }, { status: 500 });
  }
}
