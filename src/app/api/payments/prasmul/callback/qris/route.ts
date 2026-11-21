import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { isMongoTransactionsUnsupported } from "@/lib/mongodb-transactions";
import { getPrasmulOrderDetail, PrasmulApiError } from "@/lib/prasmul";
import { PrasmulStatusMismatchError, verifyPrasmulCallbackStatus } from "@/lib/prasmul-status";
import { PaymentFinalizationConflict } from "@/lib/payment-finalization";
import { finalizePrasmulPayment } from "@/lib/prasmul-finalization";
import Payment from "@/models/Payment";

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
    !/^PRASMUL-\S{1,160}$/i.test(data.reference_id) ||
    data.status !== "COMPLETED" ||
    typeof data.amount !== "number" ||
    !Number.isSafeInteger(data.amount) ||
    data.amount <= 0
  ) {
    return NextResponse.json(
      { success: false, message: "Invalid QRIS callback payload." },
      { status: 400, headers },
    );
  }

  if (
    process.env.NODE_ENV === "development" &&
    process.env.PRASMUL_QRIS_CALLBACK_TEST_MODE === "true"
  ) {
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

  try {
    await connectDB();
    const escapedReference = data.reference_id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const payments = await Payment.find({
      provider: "PRASMUL",
      prasmulOrderId: new RegExp(`^${escapedReference}$`, "i"),
    }).limit(2).lean();

    if (payments.length !== 1 || !payments[0].prasmulOrderId) {
      return NextResponse.json(
        { success: false, message: "PRASMUL payment not found or reference is ambiguous." },
        { status: 409, headers },
      );
    }

    const payment = payments[0];
    const storedReference = payment.prasmulOrderId;
    if (!storedReference) {
      return NextResponse.json(
        { success: false, message: "PRASMUL payment reference is missing." },
        { status: 409, headers },
      );
    }
    if (
      storedReference.toLowerCase() !== data.reference_id.toLowerCase() ||
      payment.grossAmount !== data.amount ||
      (payment.prasmulAmount !== undefined && payment.prasmulAmount !== payment.grossAmount)
    ) {
      return NextResponse.json(
        { success: false, message: "PRASMUL payment details do not match." },
        { status: 409, headers },
      );
    }

    let remoteOrder;
    try {
      remoteOrder = await getPrasmulOrderDetail(storedReference);
    } catch (error) {
      console.error("PRASMUL callback order-detail lookup failed.");
      return NextResponse.json(
        { success: false, message: "Could not verify the PRASMUL order." },
        { status: error instanceof PrasmulApiError && error.status === 404 ? 409 : 502, headers },
      );
    }

    let providerStatus: "PENDING" | "PAID" | "UNKNOWN";
    try {
      providerStatus = verifyPrasmulCallbackStatus(payment, remoteOrder, data.reference_id, data.amount);
    } catch (error) {
      if (!(error instanceof PrasmulStatusMismatchError)) throw error;
      return NextResponse.json(
        { success: false, message: "PRASMUL payment details do not match." },
        { status: 409, headers },
      );
    }
    if (providerStatus !== "PAID") {
      return NextResponse.json(
        { success: false, message: "PRASMUL has not confirmed a successful payment." },
        { status: 409, headers },
      );
    }

    const { alreadyProcessed } = await finalizePrasmulPayment(payment);

    return NextResponse.json({
      success: true,
      message: alreadyProcessed ? "Payment already processed." : "Payment verified and processed.",
      verifiedBy: "PRASMUL_ORDER_DETAIL",
    }, { headers });
  } catch (error) {
    if (error instanceof PaymentFinalizationConflict) {
      return NextResponse.json(
        { success: false, message: "Payment or order requires manual reconciliation." },
        { status: 409, headers },
      );
    }
    if (isMongoTransactionsUnsupported(error)) {
      console.error("PRASMUL callback requires a MongoDB replica set or sharded cluster.");
      return NextResponse.json(
        { success: false, message: "MongoDB transactions are unavailable; payment was not finalized." },
        { status: 503, headers },
      );
    }
    console.error("PRASMUL callback processing failed.");
    return NextResponse.json(
      { success: false, message: "Could not process the PRASMUL payment." },
      { status: 500, headers },
    );
  }
}
