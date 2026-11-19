
import { NextResponse } from "next/server";
import { POST as rejectUnverifiedWebhook } from "../../webhook/route";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: Request) {
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.PRASMUL_QRIS_CALLBACK_TEST_MODE !== "true"
  ) {
    return rejectUnverifiedWebhook();
  }

  const headers = { "Cache-Control": "no-store" };
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    return NextResponse.json(
      { success: false, message: "Content-Type must be application/json." },
      { status: 415, headers },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return NextResponse.json(
      { success: false, message: "Invalid JSON." },
      { status: 400, headers },
    );
  }

  if (
    !isRecord(payload) ||
    payload.event !== "qr.payment" ||
    !isRecord(payload.data) ||
    typeof payload.data.id !== "string" ||
    !payload.data.id.trim() ||
    typeof payload.data.reference_id !== "string" ||
    !/^PRASMUL-\S+$/.test(payload.data.reference_id) ||
    payload.data.status !== "COMPLETED" ||
    typeof payload.data.amount !== "number" ||
    !Number.isFinite(payload.data.amount)
  ) {
    return NextResponse.json(
      { success: false, message: "Invalid QRIS test callback payload." },
      { status: 400, headers },
    );
  }

  return NextResponse.json(
    {
      success: true,
      mode: "TEST",
      authenticated: false,
      paymentProcessed: false,
      message: "Test payload accepted; no payment was processed.",
    },
    { status: 200, headers },
  );
}
