import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { processSellerFinancialResolution, recordSellerResolutionFailure } from "@/lib/seller-financial-resolution";
import SellerFinancialResolution from "@/models/SellerFinancialResolution";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ success: false, message: "Cron configuration error." }, { status: 500 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
  }
  try {
    await connectDB();
    const jobs = await SellerFinancialResolution.find({
      status: "PENDING",
      $or: [{ nextAttemptAt: { $exists: false } }, { nextAttemptAt: { $lte: new Date() } }],
    })
      .sort({ createdAt: 1, _id: 1 })
      .limit(25)
      .select("_id")
      .lean();
    let resolved = 0;
    let onHold = 0;
    let failed = 0;
    for (const job of jobs) {
      try {
        const status = await processSellerFinancialResolution(job._id);
        if (status === "RESOLVED") resolved += 1;
        if (status === "ON_HOLD") onHold += 1;
      } catch (error) {
        failed += 1;
        console.error("Seller financial resolution job failed:", job._id.toString(), error);
        try {
          await recordSellerResolutionFailure(job._id);
        } catch (recordError) {
          console.error("Could not record seller resolution failure:", job._id.toString(), recordError);
        }
      }
    }
    return NextResponse.json(
      { success: failed === 0, processed: jobs.length, resolved, onHold, failed },
      { status: failed ? 500 : 200 },
    );
  } catch (error) {
    console.error("Seller financial resolution worker error:", error);
    return NextResponse.json({ success: false, message: "Seller financial resolution failed; pending work can be retried." }, { status: 500 });
  }
}
