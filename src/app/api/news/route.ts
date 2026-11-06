import { connection, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import News from "@/models/News";
import { ensureMockDataSeeded } from "@/lib/mock-seed";

export async function GET() {
  await connection();
  try {
    await connectDB();
    await ensureMockDataSeeded();
    const items = await News.find({ status: "published" }).sort({ date: -1 }).select("title date description clothesDistributed image").lean();
    return NextResponse.json({ success: true, data: items });
  } catch (error) {
    console.error("Get public news error:", error);
    return NextResponse.json({ success: false, message: "Could not load Swap News." }, { status: 500 });
  }
}
