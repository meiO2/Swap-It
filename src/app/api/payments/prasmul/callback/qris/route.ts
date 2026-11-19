import { NextResponse } from "next/server";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };

  const contentType = request.headers
    .get("content-type")
    ?.split(";")[0]
    .trim()
    .toLowerCase();

  if (contentType !== "application/json") {
    return NextResponse.json(
      { success: false, message: "Content-Type must be application/json." },
      { status: 415, headers },
    );
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, message: "Invalid JSON." },
      { status: 400, headers },
    );
  }

  if (
    !isRecord(payload) ||
    payload.event !== "qr.payment" ||
    !isRecord(payload.data)
  ) {
    return NextResponse.json(
      { success: false, message: "Invalid callback event or data." },
      { status: 400, headers },
    );
  }

  const data = payload.data;

  if (
    typeof data.id !== "string" ||
    !data.id.trim() ||
    typeof data.reference_id !== "string" ||
    !/^PRASMUL-\S+$/.test(data.reference_id) ||
    data.status !== "COMPLETED" ||
    typeof data.amount !== "number" ||
    !Number.isFinite(data.amount) ||
    data.amount <= 0
  ) {
    return NextResponse.json(
      { success: false, message: "Invalid QRIS callback payload." },
      { status: 400, headers },
    );
  }

  console.log("[PRASMUL QRIS] Callback received (unverified):", {
    transactionId: data.id,
    referenceId: data.reference_id,
    status: data.status,
    amount: data.amount,
  });

  return NextResponse.json(
    {
      success: true,
      message: "QRIS callback payload received successfully.",
      received: true,
      authenticated: false,
      paymentProcessed: false,
    },
    { status: 200, headers },
  );
}
