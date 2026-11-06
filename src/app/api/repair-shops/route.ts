import { NextResponse } from "next/server";
import { ensureMockDataSeeded } from "@/lib/mock-seed";
import RepairShop from "@/models/RepairShop";

export async function GET() {
  try {
    await ensureMockDataSeeded();
    const shops = await RepairShop.find({ isActive: true }).sort({ createdAt: 1 }).lean();
    return NextResponse.json({
      success: true,
      data: shops.map(({ shopId, name, category, rating, distance, address, image }) => ({
        id: shopId,
        name,
        category,
        rating,
        distance,
        address,
        image,
      })),
    });
  } catch (error) {
    console.error("Get repair shops error:", error);
    return NextResponse.json({ success: false, message: "Could not load repair shops." }, { status: 500 });
  }
}
