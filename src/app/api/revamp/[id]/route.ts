import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import { ensureMockDataSeeded } from "@/lib/mock-seed";
import RevampMerchandise from "@/models/RevampMerchandise";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();
    await ensureMockDataSeeded();
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) return NextResponse.json({ success: false, message: "Revamp product not found." }, { status: 404 });
    const item = await RevampMerchandise.findOne({ _id: id, status: "available" }).lean();
    if (!item) return NextResponse.json({ success: false, message: "Revamp product not found." }, { status: 404 });
    return NextResponse.json({ success: true, data: item });
  } catch (error) {
    console.error("Get Revamp product error:", error);
    return NextResponse.json({ success: false, message: "Could not load Revamp product." }, { status: 500 });
  }
}
