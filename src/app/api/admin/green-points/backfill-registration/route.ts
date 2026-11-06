import { NextResponse } from "next/server";
import { requireRole } from "@/lib/authorization";
import { connectDB } from "@/lib/mongodb";
import { awardGreenPoints, GREEN_POINT_REWARDS } from "@/lib/green-points";
import GreenPointLedger from "@/models/GreenPointLedger";
import User from "@/models/User";

export async function POST() {
  try {
    const auth = await requireRole(["ADMIN"]);
    if (!auth.success) return auth.response;

    await connectDB();
    const users = await User.find({}, "_id").lean();
    const existing = await GreenPointLedger.find({
      referenceKey: { $in: users.map((user) => `registration:${user._id.toString()}`) },
    }).select("referenceKey").lean();
    const existingKeys = new Set(existing.map((entry) => entry.referenceKey));
    let awarded = 0;

    for (const user of users) {
      const referenceKey = `registration:${user._id.toString()}`;
      if (existingKeys.has(referenceKey)) continue;

      await awardGreenPoints({
        userId: user._id.toString(),
        amount: GREEN_POINT_REWARDS.registration,
        description: "Account registration reward backfill",
        referenceKey,
      });
      awarded += 1;
    }

    return NextResponse.json({
      success: true,
      data: {
        usersChecked: users.length,
        usersAwarded: awarded,
        amountPerUser: GREEN_POINT_REWARDS.registration,
      },
    });
  } catch (error) {
    console.error("Registration Green Point backfill error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to backfill registration Green Points." },
      { status: 500 },
    );
  }
}
