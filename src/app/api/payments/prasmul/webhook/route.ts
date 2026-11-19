import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { success: false, message: "PRASMUL webhook verification is not configured." },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}
