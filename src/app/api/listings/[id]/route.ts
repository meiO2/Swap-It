import mongoose from "mongoose";
import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/authorization";
import { connectDB } from "@/lib/mongodb";
import Listing from "@/models/Listing";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;
  try {
    const { id } = await context.params;
    if (!mongoose.isValidObjectId(id)) return NextResponse.json({ success: false, message: "Invalid listing ID." }, { status: 400 });
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null || Array.isArray(body) || typeof (body as Record<string, unknown>).pickupDate !== "string") {
      return NextResponse.json({ success: false, message: "Provide a valid pickup date." }, { status: 400 });
    }
    const { pickupDate } = body as { pickupDate: string };
    const nextDate = Date.parse(`${pickupDate}T23:59:59`);
    if (!Number.isFinite(nextDate) || nextDate < Date.now()) return NextResponse.json({ success: false, message: "Choose a future pickup date." }, { status: 400 });
    await connectDB();
    const listing = await Listing.findOne({ _id: id, sellerId: auth.user.id });
    if (!listing) return NextResponse.json({ success: false, message: "Listing not found." }, { status: 404 });
    const scheduledStart = listing.pickupDate ? Date.parse(`${listing.pickupDate}T00:00:00`) : Number.NaN;
    if (listing.fulfillment !== "Pickup" || listing.pickupChanges > 0 || !Number.isFinite(scheduledStart) || scheduledStart - Date.now() < 24 * 60 * 60 * 1000) {
      return NextResponse.json({ success: false, message: "This pickup schedule can no longer be changed." }, { status: 409 });
    }
    listing.pickupDate = pickupDate;
    listing.pickupChanges += 1;
    await listing.save();
    return NextResponse.json({ success: true, data: { id: String(listing._id), pickupDate, pickupChanges: listing.pickupChanges } });
  } catch (error) {
    console.error("Update listing pickup date error:", error);
    return NextResponse.json({ success: false, message: "Could not update the pickup date." }, { status: 500 });
  }
}
