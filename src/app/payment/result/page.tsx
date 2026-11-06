"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Clock3, XCircle } from "lucide-react";
import { formatRupiah } from "@/lib/format";
import { apiRequest } from "@/lib/api";

type PaymentStatus = "PENDING" | "PAID" | "FAILED" | "CANCELED" | "EXPIRED";

type Payment = {
  _id: string;
  orderId: string;
  grossAmount: number;
  status: PaymentStatus;
  createdAt: string;
  paidAt?: string;
};

const statusCopy: Record<
  PaymentStatus,
  { title: string; detail: string; tone: string }
> = {
  PENDING: {
    title: "Payment is being confirmed",
    detail: "We are waiting for confirmation from Midtrans.",
    tone: "text-warning",
  },
  PAID: {
    title: "Payment successful",
    detail: "Your payment has been confirmed.",
    tone: "text-success",
  },
  FAILED: {
    title: "Payment failed",
    detail: "This payment could not be completed.",
    tone: "text-danger",
  },
  CANCELED: {
    title: "Payment canceled",
    detail: "The payment was canceled and the order was released.",
    tone: "text-danger",
  },
  EXPIRED: {
    title: "Payment expired",
    detail: "The payment window expired and the order was released.",
    tone: "text-danger",
  },
};

function StatusIcon({ status }: { status: PaymentStatus }) {
  if (status === "PAID") return <CheckCircle2 size={42} />;
  if (status === "PENDING") return <Clock3 size={42} />;
  return <XCircle size={42} />;
}

export default function PaymentResultPage() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId");
  const [payment, setPayment] = useState<Payment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const displayError = orderId ? error : "Missing order ID.";

  useEffect(() => {
    if (!orderId) {
      return;
    }

    let active = true;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const requestedOrderId = orderId;

    async function loadPayment() {
      try {
        const payments = await apiRequest<Payment[]>(
          `/api/payments?orderId=${encodeURIComponent(requestedOrderId)}`,
        );
        if (!active) return;
        const current = payments[0];
        if (!current) {
          setError("Payment record was not found.");
          setLoading(false);
          return;
        }
        setPayment(current);
        setLoading(false);
        attempts += 1;
        if (current.status === "PENDING" && attempts < 100) {
          timer = setTimeout(loadPayment, 3000);
        }
      } catch (cause) {
        if (!active) return;
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not load payment status.",
        );
        setLoading(false);
      }
    }

    void loadPayment();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [orderId]);

  const status = payment?.status ?? "PENDING";
  const copy = statusCopy[status];

  return (
    <main className="min-h-dvh px-4 pb-8 pt-5">
      <header className="mb-8 flex items-center gap-3">
        <Link
          href="/orders"
          aria-label="Back to orders"
          className="flex size-11 items-center justify-center rounded-full text-ink-muted hover:bg-mint-50"
        >
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-ink">Payment status</h1>
          <p className="text-xs text-ink-muted">Order {orderId ?? "unknown"}</p>
        </div>
      </header>

      <section className="rounded-3xl bg-white p-6 text-center shadow-card">
        {loading ? (
          <p role="status" className="py-8 text-sm text-ink-muted">
            Checking payment status…
          </p>
        ) : displayError ? (
          <p role="alert" className="py-8 text-sm text-danger">
            {displayError}
          </p>
        ) : (
          <>
            <div className={`mx-auto w-fit ${copy.tone}`}>
              <StatusIcon status={status} />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-ink">{copy.title}</h2>
            <p className="mt-2 text-sm text-ink-muted">{copy.detail}</p>
            <p className="mt-5 text-xl font-bold text-primary">
              {formatRupiah(payment?.grossAmount ?? 0)}
            </p>
            {status === "PENDING" && (
              <p className="mt-2 text-xs text-ink-muted">
                This page checks for updates automatically.
              </p>
            )}
          </>
        )}
      </section>

      <div className="mt-4 grid gap-2">
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
