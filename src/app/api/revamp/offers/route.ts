import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/authorization";
import { connectDB } from "@/lib/mongodb";
import RevampOffer from "@/models/RevampOffer";

export async function GET() {
  const auth = await requireAuth(); if (!auth.success) return auth.response;
  try { await connectDB(); const offers = await RevampOffer.find({ sellerId: new mongoose.Types.ObjectId(auth.user.id) }).populate("productId", "name images size").sort({ createdAt: -1 }).lean(); return NextResponse.json({ success: true, data: offers }); }
  catch (error) { console.error("Get Revamp offers error:", error); return NextResponse.json({ success: false, message: "Could not load Revamp offers." }, { status: 500 }); }
}
