import { NextResponse } from "next/server";
import { getSwapHubs } from "@/lib/hubs";

export async function GET() {
  try {
    const hubs = await getSwapHubs();
    return NextResponse.json({ success: true, data: hubs });
  } catch (error) {
    console.error("Get Swap Hubs error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to retrieve Swap Hubs." },
      { status: 500 },
    );
  }
}
