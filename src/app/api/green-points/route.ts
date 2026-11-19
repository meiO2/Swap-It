import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { requireAuth } from "@/lib/authorization";
import { connectDB } from "@/lib/mongodb";
import GreenPointLedger from "@/models/GreenPointLedger";
import {
  getGreenPointBalance,
  getGreenPointReserveSnapshot,
} from "@/lib/green-points";
import PendingGreenPointCredit from "@/models/PendingGreenPointCredit";

export async function GET() {
  try {
    const auth = await requireAuth();
    if (!auth.success) return auth.response;
    await connectDB();
    const [balance, entries, pendingCredits, reserve] = await Promise.all([
      getGreenPointBalance(auth.user.id),
      GreenPointLedger.find({ userId: auth.user.id }).sort({ createdAt: -1 }).limit(100).lean(),
      PendingGreenPointCredit.find({
        userId: auth.user.id,
        status: { $in: ["PENDING_REFUND_GP", "PENDING_REWARD"] },
      })
        .sort({ createdAt: -1 })
        .select("status amount description createdAt")
        .lean(),
      getGreenPointReserveSnapshot(),
    ]);
    return NextResponse.json({
      success: true,
      data: {
        balance: Math.max(0, balance),
        entries,
        pendingCredits,
        redemptionAllowed: reserve.redemptionAllowed,
      },
    });
  } catch (error) {
    unstable_rethrow(error);
    console.error("Get Green Point ledger error:", error);
    return NextResponse.json({ success: false, message: "Failed to retrieve Green Point ledger." }, { status: 500 });
  }
}
