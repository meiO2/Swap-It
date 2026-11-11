"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, ExternalLink, WalletCards } from "lucide-react";
import { apiRequest } from "@/lib/api";

export default function PaymentPage() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function pay() {
    if (!orderId) {
      setError("Order ID is missing.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await apiRequest<{ redirectUrl: string }>("/api/payments", {
        method: "POST",
        body: JSON.stringify({ orderId }),
      });
      if (!result.redirectUrl) throw new Error("Xendit checkout URL is missing.");
      window.location.assign(result.redirectUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Payment could not be created.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-dvh px-4 pb-8 pt-5">
      <header className="mb-5 flex items-center gap-3">
        <Link href={orderId ? `/orders/${orderId}` : "/orders"} aria-label="Back to order" className="flex size-11 items-center justify-center rounded-full text-ink-muted hover:bg-mint-50">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-ink">Choose payment method</h1>
          <p className="text-xs text-ink-muted">Secure checkout powered by Xendit</p>
        </div>
      </header>

      <section className="rounded-3xl bg-white p-4 shadow-card">
        <div className="rounded-2xl bg-mint-50 p-4 text-sm text-ink">
          <p className="font-semibold">Pay securely with Xendit</p>
          <p className="mt-2 text-xs leading-relaxed text-ink-muted">
            You will continue to Xendit to choose an available payment method and complete checkout.
          </p>
        </div>

        {error && <p role="alert" className="mt-4 rounded-xl bg-danger/10 p-3 text-xs text-danger">{error}</p>}
        <button type="button" onClick={() => void pay()} disabled={loading} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold text-white shadow-primary disabled:opacity-60">
          {loading ? "Opening secure checkout..." : <>Continue to Xendit <ExternalLink size={16} /></>}
        </button>
        <p className="mt-3 flex items-center justify-center gap-2 text-xs text-ink-muted">
          <WalletCards size={15} /> Payment methods are shown on Xendit checkout.
        </p>
      </section>
    </main>
  );
}
