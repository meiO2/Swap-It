import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import { ensureMockDataSeeded } from "@/lib/mock-seed";
import News from "@/models/News";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();
    await ensureMockDataSeeded();
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) return NextResponse.json({ success: false, message: "News article not found." }, { status: 404 });
    const item = await News.findOne({ _id: id, status: "published" }).select("title date description clothesDistributed image").lean();
    if (!item) return NextResponse.json({ success: false, message: "News article not found." }, { status: 404 });
    return NextResponse.json({ success: true, data: item });
  } catch (error) {
    console.error("Get news article error:", error);
    return NextResponse.json({ success: false, message: "Could not load news article." }, { status: 500 });
  }
}
