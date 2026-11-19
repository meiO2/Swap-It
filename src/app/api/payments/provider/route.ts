import { connection, NextResponse } from "next/server";
import { getPaymentProvider } from "@/lib/payment-provider";

export async function GET() {
  await connection();
  try {
    return NextResponse.json({ success: true, data: { provider: getPaymentProvider() } });
  } catch {
    return NextResponse.json(
      {
        success: false,
        message: "Invalid payment provider configuration.",
      },
      { status: 500 },
    );
  }
}
