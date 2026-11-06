import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/authorization";
import { connectDB } from "@/lib/mongodb";
import GreenPointLedger from "@/models/GreenPointLedger";
import { getGreenPointBalance } from "@/lib/green-points";

export async function GET() {
  try {
    const auth = await requireAuth();
    if (!auth.success) return auth.response;
    await connectDB();
    const [balance, entries] = await Promise.all([
      getGreenPointBalance(auth.user.id),
      GreenPointLedger.find({ userId: auth.user.id }).sort({ createdAt: -1 }).limit(100).lean(),
    ]);
    return NextResponse.json({ success: true, data: { balance, entries } });
  } catch (error) {
    console.error("Get Green Point ledger error:", error);
    return NextResponse.json({ success: false, message: "Failed to retrieve Green Point ledger." }, { status: 500 });
  }
}
