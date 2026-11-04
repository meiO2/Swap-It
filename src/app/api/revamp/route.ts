import { connection, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import RevampMerchandise from "@/models/RevampMerchandise";

export async function GET() {
  await connection();
  try {
    await connectDB();
    const products = await RevampMerchandise.find({ status: "available" }).sort({ createdAt: -1 }).lean();
    return NextResponse.json({ success: true, data: products });
  } catch (error) {
    console.error("Get public Revamp merchandise error:", error);
    return NextResponse.json({ success: false, message: "Could not load Revamp merchandise." }, { status: 500 });
  }
}
