"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, BadgeCheck, CircleAlert, PackageCheck } from "lucide-react";
import { catalogProducts } from "@/data/mock";
import { formatRupiah } from "@/lib/format";
import { useSwapStore } from "@/store/useSwapStore";

export default function OrderQcAdminPage() {
  const orders = useSwapStore((state) => state.orders);
  const approveOrderQc = useSwapStore((state) => state.approveOrderQc);
  const rejectOrderQc = useSwapStore((state) => state.rejectOrderQc);
  const [notice, setNotice] = useState("");
  const pendingOrders = orders.filter((order) => order.status === "Processing" && order.qcStatus === "pending");

  return (
    <main className="min-h-dvh space-y-4 bg-background px-5 pb-10 pt-6">
      <header className="flex items-center gap-3"><Link href="/orders" aria-label="Back to orders" className="flex size-11 items-center justify-center rounded-full text-ink-muted hover:bg-mint-50"><ArrowLeft size={20} /></Link><div><p className="text-xs font-medium uppercase tracking-wide text-primary">Prototype admin</p><h1 className="text-2xl font-bold text-ink">Order quality checks</h1></div></header>
      {notice && <p role="status" aria-live="polite" className="rounded-2xl bg-success/10 p-3 text-sm font-medium text-success">{notice}</p>}
      <p className="text-sm leading-relaxed text-ink-muted">Review a purchase before shipping. Approval advances delivery; a rejection opens the buyer&apos;s 3-day decision window.</p>
      {pendingOrders.length ? pendingOrders.map((order) => {
        const firstItem = order.items[0];
        const product = catalogProducts.find((item) => item.id === firstItem?.productId);
        return (
          <article key={order.id} className="rounded-3xl bg-white p-5 shadow-card">
            <p className="text-xs text-ink-muted">Order {order.id}</p>
            <h2 className="mt-1 text-base font-semibold text-ink">{product?.name ?? "Marketplace item"} × {firstItem?.quantity ?? 1}</h2>
            <p className="mt-1 text-xs text-ink-muted">{formatRupiah(order.productValue)} · {order.delivery?.method === "pickup" ? `Pickup at ${order.delivery.hub?.name ?? "Swap Hub"}` : "Courier delivery"}</p>
            <p className="mt-4 flex items-center gap-2 rounded-xl bg-warning/10 p-3 text-xs text-warning"><CircleAlert size={16} /> Quality check pending</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => { approveOrderQc(order.id); setNotice(`Order ${order.id} approved.`); }} className="flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-3 text-xs font-semibold text-white"><BadgeCheck size={16} /> Approve</button>
              <button type="button" onClick={() => { rejectOrderQc(order.id); setNotice(`Order ${order.id} rejected; buyer decision is pending.`); }} className="flex min-h-11 items-center justify-center gap-2 rounded-full border border-danger/30 px-3 text-xs font-semibold text-danger"><CircleAlert size={16} /> Reject</button>
            </div>
          </article>
        );
      }) : (
        <section className="rounded-3xl bg-white p-6 text-center shadow-card"><PackageCheck className="mx-auto text-success" size={30} /><h2 className="mt-3 text-base font-semibold text-ink">No orders awaiting QC</h2><p className="mt-1 text-sm text-ink-muted">New checkout orders appear here until reviewed.</p></section>
      )}
    </main>
  );
}
