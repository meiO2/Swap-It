"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Clock3, XCircle } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { apiRequest } from "@/lib/api";
import { formatRupiah } from "@/lib/format";

type PaymentProvider = "XENDIT" | "PRASMUL";

type PaymentStatus = "PENDING" | "PAID" | "FAILED" | "CANCELED" | "EXPIRED";

type Payment = {
  _id?: string;
  paymentId?: string;
  orderId: string;
  provider?: PaymentProvider;
  grossAmount: number;
  status: PaymentStatus;
  qrCodeId?: string;
  qrString?: string;
  xenditQrCodeId?: string;
  xenditQrString?: string;
  prasmulQrId?: string;
  prasmulPaymentCode?: string;
  expiredPayment?: string;
  verificationStatus?: "PENDING" | "UNKNOWN";
  redirectUrl?: string;
  testMode?: boolean;
};

const statusCopy: Record<PaymentStatus, { title: string; detail: string }> = {
  PENDING: {
    title: "Waiting for payment",
    detail: "The status will update automatically after payment is confirmed.",
  },
  PAID: {
    title: "Payment successful",
    detail: "Your QRIS payment has been confirmed.",
  },
  FAILED: {
    title: "Payment failed",
    detail: "This payment could not be completed.",
  },
  CANCELED: {
    title: "Payment canceled",
    detail: "This order has been canceled.",
  },
  EXPIRED: {
    title: "Payment expired",
    detail: "The payment window has expired.",
  },
};

function StatusIcon({ status }: { status: PaymentStatus }) {
  if (status === "PAID") {
    return <CheckCircle2 className="text-success" size={20} />;
  }

  if (status === "PENDING") {
    return <Clock3 className="text-warning" size={20} />;
  }

  return <XCircle className="text-danger" size={20} />;
}

export default function PaymentPage() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId");

  const [payment, setPayment] = useState<Payment | null>(null);
  const [loading, setLoading] = useState(Boolean(orderId));
  const [error, setError] = useState("");
  const [statusError, setStatusError] = useState("");
  const [pollingTimedOut, setPollingTimedOut] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [simulationMessage, setSimulationMessage] = useState("");
  const [qrExpired, setQrExpired] = useState(false);

  useEffect(() => {
    if (!payment?.expiredPayment) return;
    const expires = Date.parse(payment.expiredPayment);
    const delay = Number.isFinite(expires) ? Math.max(expires - Date.now(), 0) : 0;
    const timer = setTimeout(() => setQrExpired(true), Math.min(delay, 2147483647));
    return () => clearTimeout(timer);
  }, [payment?.expiredPayment]);

  const displayError = orderId ? error : "Order ID is missing.";

  async function simulatePayment() {
    if (!orderId || simulating) return;

    setSimulating(true);
    setStatusError("");

    try {
      await apiRequest<{ status: string }>("/api/payments/simulate", {
        method: "POST",
        body: JSON.stringify({ orderId }),
      });

      setSimulationMessage(
        "Simulation requested. Waiting for Xendit to confirm it…",
      );
    } catch (cause) {
      setStatusError(
        cause instanceof Error ? cause.message : "Could not simulate payment.",
      );
    } finally {
      setSimulating(false);
    }
  }

  useEffect(() => {
    if (!orderId) {
      return;
    }

    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    const requestedOrderId = orderId;

    async function checkStatus(onlyIfExisting = false) {
      if (!active) return;

      attempts += 1;

      try {
        const payments = await apiRequest<Payment[]>(
          `/api/payments?orderId=${encodeURIComponent(requestedOrderId)}`,
        );

        if (!active) return;

        const current = payments[0];

        if (!current) {
          if (onlyIfExisting) return;
          throw new Error("Payment record was not found.");
        }

        setPayment({
          ...current,
          qrCodeId: current.qrCodeId ?? current.xenditQrCodeId,
          qrString: current.qrString ?? current.xenditQrString,
        });

        setStatusError(
          current.provider === "PRASMUL" &&
            current.verificationStatus === "UNKNOWN"
            ? "Payment requires verification. Do not pay again."
            : "",
        );

        if (current.status === "PENDING" && attempts < 60) {
          timer = setTimeout(() => void checkStatus(), 5000);
        } else if (current.status === "PENDING") {
          setPollingTimedOut(true);
        }
      } catch (cause) {
        if (!active) return;

        setStatusError(
          cause instanceof Error
            ? cause.message
            : "Could not load payment status.",
        );

        if (!onlyIfExisting && attempts < 60) {
          timer = setTimeout(() => void checkStatus(), 5000);
        } else if (!onlyIfExisting) {
          setPollingTimedOut(true);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    // ==========================================
    // CREATE PAYMENT
    // ==========================================
    async function createPayment() {
      try {
        const result = await apiRequest<Payment>("/api/payments", {
          method: "POST",
          body: JSON.stringify({
            orderId: requestedOrderId,
          }),
        });

        if (!active) return;

        if (result.provider !== "PRASMUL" && result.redirectUrl) {
          window.location.assign(result.redirectUrl);
          return;
        }

        setPayment({
          ...result,
          qrCodeId: result.qrCodeId ?? result.prasmulQrId,
          qrString:
            result.qrString ??
            result.prasmulPaymentCode ??
            result.xenditQrString,
        });

        setLoading(false);

        // Langsung cek status setelah QR berhasil dibuat.
        await checkStatus();
      } catch (cause) {
        if (!active) return;

        setError(
          cause instanceof Error
            ? cause.message
            : "Could not create the QRIS payment code.",
        );

        setLoading(false);
        await checkStatus(true);
      }
    }

    void createPayment();

    return () => {
      active = false;

      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [orderId]);

  const status =
    payment?.provider === "PRASMUL" &&
    payment.verificationStatus === "UNKNOWN"
      ? "PENDING"
      : payment?.status ?? "PENDING";
  const copy = statusCopy[status];

  return (
    <main className="min-h-dvh px-4 pb-8 pt-5">
      {/* HEADER */}
      <header className="mb-5 flex items-center gap-3">
        <Link
          href={orderId ? `/orders/${orderId}` : "/orders"}
          aria-label="Back to order"
          className="flex size-11 items-center justify-center rounded-full text-ink-muted hover:bg-mint-50"
        >
          <ArrowLeft size={20} />
        </Link>

        <div>
          <h1 className="text-xl font-semibold text-ink">QRIS payment</h1>

          <p className="text-xs text-ink-muted">
            Complete your payment on this page
          </p>
        </div>
      </header>

      {/* PAYMENT CARD */}
      <section className="mx-auto max-w-md rounded-3xl bg-white p-5 shadow-card">
        {/* TOTAL */}
        <div className="rounded-2xl bg-mint-50 p-4 text-center">
          <p className="text-xs font-medium text-ink-muted">Total due</p>

          <p className="mt-1 text-2xl font-bold text-primary">
            {formatRupiah(payment?.grossAmount ?? 0)}
          </p>

          <p className="mt-2 text-xs font-semibold text-primary">
            QRIS is the only available payment method
          </p>
        </div>

        {/* ERROR */}
        {displayError ? (
          <p
            role="alert"
            className="mt-4 rounded-xl bg-danger/10 p-3 text-xs text-danger"
          >
            {displayError}
          </p>
        ) : payment?.qrString && status === "PENDING" && !qrExpired ? (
          <>
            {/* QR CODE */}
            <div className="mx-auto mt-5 flex w-fit rounded-2xl border border-border bg-white p-3">
              <QRCodeSVG
                value={payment.qrString}
                size={240}
                level="M"
                title="QRIS payment code"
                className="h-auto max-w-full"
              />
            </div>

            <p className="mt-4 text-center text-sm font-semibold text-ink">
              Scan this QR code to pay
            </p>

            <p className="mt-1 text-center text-xs leading-relaxed text-ink-muted">
              Open a mobile banking or e-wallet app that supports QRIS and scan
              the code above. Confirm the amount before completing payment.
            </p>
          </>
        ) : loading ? (
          <p role="status" className="py-8 text-center text-sm text-ink-muted">
            Preparing your QRIS code…
          </p>
        ) : null}
        {payment?.expiredPayment && (
          <p className="mt-3 text-center text-xs text-ink-muted">
            QR expires: {new Date(payment.expiredPayment).toLocaleString("id-ID")}
            {qrExpired ? " — QR no longer displayed; payment status is still being verified." : ""}
          </p>
        )}

        {/* PAYMENT STATUS */}
        {payment && (
          <div
            role="status"
            className="mt-5 flex items-start gap-3 rounded-2xl border border-border p-4"
          >
            <StatusIcon status={status} />

            <div>
              <p className="text-sm font-semibold text-ink">{copy.title}</p>

              <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                {copy.detail}
              </p>

              {status === "PENDING" && (
                <p className="mt-2 text-xs text-ink-muted">
                  {pollingTimedOut
                    ? `Confirmation is taking longer than expected. Do not pay again; the status will update when ${
                        payment.provider === "PRASMUL" ? "PRASMUL" : "Xendit"
                      } confirms the payment.`
                    : "No need to check manually. We are checking the payment status automatically."}
                </p>
              )}

              {statusError && (
                <p className="mt-2 text-xs text-danger">{statusError}</p>
              )}
            </div>
          </div>
        )}

        {/* XENDIT TEST SIMULATION ONLY */}
        {!displayError &&
          payment?.provider === "XENDIT" &&
          payment.testMode &&
          payment.status === "PENDING" &&
          payment.qrCodeId && (
            <div className="mt-4 rounded-2xl border border-warning/30 bg-warning/5 p-4">
              <p className="text-xs leading-relaxed text-ink-muted">
                Test mode only. Simulating marks this order as paid without an
                actual QRIS transaction.
              </p>

              <button
                type="button"
                onClick={() => void simulatePayment()}
                disabled={simulating}
                className="mt-3 flex min-h-11 w-full items-center justify-center rounded-full bg-ink text-sm font-semibold text-white disabled:opacity-60"
              >
                {simulating
                  ? "Simulating payment…"
                  : "Simulate successful payment"}
              </button>

              {simulationMessage && (
                <p
                  role="status"
                  className="mt-2 text-center text-xs text-ink-muted"
                >
                  {simulationMessage}
                </p>
              )}
            </div>
          )}
      </section>

      {/* NAVIGATION */}
      <div className="mx-auto mt-4 grid max-w-md gap-2">
        <Link
          href={`/orders/${orderId ?? ""}`}
          className="flex min-h-11 items-center justify-center rounded-full bg-primary text-sm font-semibold text-white"
        >
          View order
        </Link>

        <Link
          href="/payments"
          className="flex min-h-11 items-center justify-center rounded-full border border-border bg-white text-sm font-semibold text-ink"
        >
          Payment history
        </Link>
      </div>
    </main>
  );
}
