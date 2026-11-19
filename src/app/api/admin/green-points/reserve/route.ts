import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/authorization";
import { connectDB } from "@/lib/mongodb";
import {
  getGreenPointReserveSnapshot,
  topUpGreenPointReserve,
} from "@/lib/green-points";
import GreenPointReserveLedger from "@/models/GreenPointReserveLedger";
import PendingGreenPointCredit from "@/models/PendingGreenPointCredit";

export async function GET() {
  try {
    const auth = await requireRole(["ADMIN"]);
    if (!auth.success) return auth.response;
    await connectDB();

    const [reserve, ledger, pending] = await Promise.all([
      getGreenPointReserveSnapshot(),
      GreenPointReserveLedger.find().sort({ createdAt: -1 }).limit(50).lean(),
      PendingGreenPointCredit.find({
        status: { $in: ["PENDING_REFUND_GP", "PENDING_REWARD"] },
      })
        .sort({ createdAt: 1 })
        .limit(100)
        .lean(),
    ]);
    return NextResponse.json({
      success: true,
      data: { reserve, ledger, pending },
    });
  } catch (error) {
    console.error("Get Green Point reserve error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to retrieve Green Point reserve." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(["ADMIN"]);
    if (!auth.success) return auth.response;
    await connectDB();

    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return NextResponse.json(
        { success: false, message: "Invalid request body." },
        { status: 400 },
      );
    }

    const input = body as Record<string, unknown>;
    if (
      input.confirmedFunded !== true ||
      typeof input.amount !== "number" ||
      !Number.isSafeInteger(input.amount) ||
      input.amount <= 0 ||
      typeof input.referenceKey !== "string" ||
      input.referenceKey.trim().length < 3 ||
      input.referenceKey.length > 200 ||
      (input.externalReference !== undefined &&
        (typeof input.externalReference !== "string" ||
          input.externalReference.length > 200)) ||
      (input.evidenceUrl !== undefined &&
        (typeof input.evidenceUrl !== "string" ||
          input.evidenceUrl.length > 2048)) ||
      (input.note !== undefined &&
        (typeof input.note !== "string" || input.note.length > 1000))
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Confirm that funds were deposited and provide a valid amount and reference key.",
        },
        { status: 400 },
      );
    }

    const reserve = await topUpGreenPointReserve({
      amount: input.amount,
      referenceKey: input.referenceKey.trim(),
      actorId: auth.user.id,
      externalReference:
        typeof input.externalReference === "string"
          ? input.externalReference.trim()
          : undefined,
      evidenceUrl:
        typeof input.evidenceUrl === "string"
          ? input.evidenceUrl.trim()
          : undefined,
      note: typeof input.note === "string" ? input.note.trim() : undefined,
    });
    return NextResponse.json({ success: true, data: reserve });
  } catch (error) {
    console.error("Green Point reserve top-up error:", error);
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to record Green Point reserve top-up.",
      },
      { status: 500 },
    );
  }
}
