import { NextResponse } from "next/server";
import { getPrasmulToken } from "@/lib/prasmul";

export async function GET() {
  // Hanya boleh digunakan saat development.
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json(
      { success: false, message: "Not available." },
      { status: 404 },
    );
  }

  try {
    const token = await getPrasmulToken();

    return NextResponse.json({
      success: true,
      message: "PRASMUL partner login successful.",
      tokenReceived: Boolean(token),
    });
  } catch (error) {
    console.error("PRASMUL login test failed:", error);

    return NextResponse.json(
      {
        success: false,
        message: "PRASMUL partner login failed. Check server logs.",
      },
      { status: 500 },
    );
  }
}
