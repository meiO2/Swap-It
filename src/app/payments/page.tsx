"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Clock3, XCircle } from "lucide-react";
import { apiRequest } from "@/lib/api";
import { formatRupiah } from "@/lib/format";

type PaymentStatus = "PENDING" | "PAID" | "FAILED" | "CANCELED" | "EXPIRED";
type Payment = {
  _id: string;
  orderId: string;
  grossAmount: number;
  status: PaymentStatus;
  createdAt: string;
};

function StatusIcon({ status }: { status: PaymentStatus }) {
  if (status === "PAID") return <CheckCircle2 className="text-success" size={20} />;
  if (status === "PENDING") return <Clock3 className="text-warning" size={20} />;
  return <XCircle className="text-danger" size={20} />;
}

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    apiRequest<Payment[]>("/api/payments")
      .then(setPayments)
      .catch((cause: unknown) =>
        setError(
          cause instanceof Error ? cause.message : "Could not load payments.",
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="min-h-dvh px-4 pb-8 pt-5">
      <header className="mb-5 flex items-center gap-3">
        <Link
          href="/profile"
          aria-label="Back to profile"
          className="flex size-11 items-center justify-center rounded-full text-ink-muted hover:bg-mint-50"
        >
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-ink">Payment history</h1>
          <p className="text-xs text-ink-muted">Your Midtrans transactions</p>
        </div>
      </header>

      {error && (
        <p role="alert" className="mb-3 rounded-xl bg-danger/10 p-3 text-xs text-danger">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status" className="rounded-2xl bg-white p-5 text-sm text-ink-muted">
          Loading payments…
        </p>
      ) : payments.length === 0 ? (
        <section className="rounded-3xl bg-white p-6 text-center shadow-card">
          <p className="text-sm text-ink-muted">No payments yet.</p>
        </section>
      ) : (
        <div className="space-y-3">
          {payments.map((payment) => (
            <Link
              key={payment._id}
              href={`/payment/result?orderId=${encodeURIComponent(payment.orderId)}`}
              className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-card"
            >
              <StatusIcon status={payment.status} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink">
                  {payment.status}
                </span>
                <span className="mt-1 block truncate text-xs text-ink-muted">
                  Order {payment.orderId}
                </span>
              </span>
              <span className="text-sm font-semibold text-primary">
                {formatRupiah(payment.grossAmount)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
