"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";

type RefundItem = {
  id: string;
  reason: string;
  description: string;
  status: string;
  evidence: string[];
  userId?: string | { name?: string; email?: string };
  orderId?: string | {
    subtotal?: number;
    shippingFee?: number;
  };
};

function getBuyerName(userId: RefundItem["userId"]) {
  return typeof userId === "object" && userId !== null ? userId.name ?? "Buyer" : "Buyer";
}

function getBuyerEmail(userId: RefundItem["userId"]) {
  return typeof userId === "object" && userId !== null ? userId.email : undefined;
}

function getOrderValue(orderId: RefundItem["orderId"]) {
  return typeof orderId === "object" && orderId !== null ? orderId.subtotal : undefined;
}

function getShippingFee(orderId: RefundItem["orderId"]) {
  return typeof orderId === "object" && orderId !== null ? orderId.shippingFee : undefined;
}

export default function AdminRefundsPage() {
  const [items, setItems] = useState<RefundItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const loadRefunds = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setItems(await apiRequest<RefundItem[]>("/api/admin/refunds"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load refund requests.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadRefunds();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadRefunds]);

  async function createDemo() {
    setBusy("demo");
    setError("");
    try {
      const result = await apiRequest<{ orderId: string; buyer: { name: string; email: string }; product: { name: string } }>("/api/admin/refunds/mock", { method: "POST" });
      window.alert(`Existing order prepared for ${result.buyer.name} (${result.buyer.email}). Product: ${result.product.name}. Log in as Uli, open /orders/${result.orderId}, then reject the QC report to test the refund.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create demo.");
    } finally {
      setBusy("");
    }
  }

  async function action(item: RefundItem, operation: "approve" | "reject") {
    const reason = operation === "reject"
      ? window.prompt("Enter a rejection reason:")
      : undefined;
    if (operation === "reject" && (!reason || reason.trim().length < 3)) {
      if (reason !== null) setError("A rejection reason is required.");
      return;
    }
    const rejectionReason = reason ?? "";

    setBusy(item.id);
    setError("");
    try {
      await apiRequest(`/api/admin/refunds/${encodeURIComponent(item.id)}/${operation}`, {
        method: "POST",
        body: JSON.stringify(operation === "reject" ? { reason: rejectionReason.trim() } : {}),
      });
      await loadRefunds();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Could not ${operation} this refund.`);
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">Admin / Refunds</p>
        <h1 className="mt-1 text-2xl font-bold text-ink">Refund management</h1>
        <button type="button" disabled={busy === "demo"} onClick={() => void createDemo()} className="mt-3 min-h-10 rounded-full border border-primary/40 px-4 text-xs font-semibold text-primary disabled:opacity-60">
          {busy === "demo" ? "Creating demo…" : "Create QC refund demo"}
        </button>
      </header>
      {error && <p role="alert" className="mb-3 rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p>}
      {loading ? <p role="status" className="rounded-2xl bg-white p-5 text-sm text-ink-muted">Loading refund requests…</p> : (
        <div className="space-y-3">
          {items.map((item) => (
            <article key={item.id} className="rounded-2xl bg-white p-5 shadow-card">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="font-semibold text-ink">{item.reason.replaceAll("_", " ")}</h2>
                  <p className="mt-1 text-xs text-ink-muted">{getBuyerName(item.userId)} · {getBuyerEmail(item.userId)}</p>
                </div>
                <span className="rounded-full bg-mint-50 px-3 py-1 text-xs font-bold text-primary">{item.status}</span>
              </div>
              <p className="mt-3 text-sm text-ink-muted">{item.description}</p>
              <p className="mt-2 text-xs text-ink-muted">
                Order value: Rp{getOrderValue(item.orderId)?.toLocaleString("id-ID") ?? "—"} · Shipping: Rp{getShippingFee(item.orderId)?.toLocaleString("id-ID") ?? "0"}
              </p>
              {item.evidence?.length > 0 && <div className="mt-3 flex gap-2">{item.evidence.map((url) => <a key={url} href={url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-primary underline">Evidence</a>)}</div>}
              {["REQUESTED", "UNDER_REVIEW"].includes(item.status) && <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <button type="button" disabled={busy === item.id} onClick={() => void action(item, "approve")} className="min-h-11 rounded-full bg-primary text-sm font-semibold text-white disabled:opacity-60">Approve &amp; process</button>
                <button type="button" disabled={busy === item.id} onClick={() => void action(item, "reject")} className="min-h-11 rounded-full border border-danger text-sm font-semibold text-danger disabled:opacity-60">Reject</button>
              </div>}
            </article>
          ))}
          {items.length === 0 && <p className="rounded-2xl bg-white p-5 text-sm text-ink-muted">No refund requests.</p>}
        </div>
      )}
    </div>
  );
}
