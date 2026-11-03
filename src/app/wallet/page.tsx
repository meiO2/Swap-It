"use client";

import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Clock3, Plus, WalletCards } from "lucide-react";
import { useEffect, useState } from "react";
import { getAvailablePointBalance, getExpiringBatches } from "@/lib/gp";
import { formatGP, formatShortDate } from "@/lib/format";
import { useSwapStore } from "@/store/useSwapStore";

export default function WalletPage() {
  const batches = useSwapStore((state) => state.pointBatches);
  const transactions = useSwapStore((state) => state.transactions);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const timerId = window.setTimeout(() => setNow(Date.now()), 0);
    return () => window.clearTimeout(timerId);
  }, []);
  const balance = now === null ? batches.reduce((total, batch) => total + batch.remaining, 0) : getAvailablePointBalance(batches, new Date(now));
  const within7Days = now ? getExpiringBatches(batches, 7, new Date(now)) : [];
  const within30Days = now ? getExpiringBatches(batches, 30, new Date(now)) : [];

  return (
    <main className="space-y-5 px-4 pb-6 pt-5">
      <header className="flex items-center gap-3"><Link href="/profile" aria-label="Back to profile" className="rounded-full p-2 text-ink-muted hover:bg-mint-50"><ArrowLeft size={20} /></Link><div><h1 className="text-xl font-semibold text-ink">Green Point wallet</h1><p className="text-xs text-ink-muted">Your circularity, in points</p></div></header>
      <section className="rounded-3xl bg-primary p-5 text-white shadow-primary">
        <p className="flex items-center gap-2 text-xs text-white/85"><WalletCards size={16} /> Total balance</p>
        <p className="mt-2 text-3xl font-bold">{formatGP(balance)}</p>
        <p className="mt-1 text-xs text-white/80">1 GP = Rp1 · Not cash, not withdrawable or transferable</p>
        <Link href="/cart" className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-semibold text-primary">Use points <ArrowUpRight size={14} /></Link>
      </section>
      {within7Days.length > 0 ? (
        <ExpiryNotice tone="danger" text={`${formatGP(within7Days.reduce((sum, batch) => sum + batch.remaining, 0))} expire within 7 days. Use them soon.`} />
      ) : within30Days.length > 0 ? (
        <ExpiryNotice tone="warning" text={`${formatGP(within30Days.reduce((sum, batch) => sum + batch.remaining, 0))} expire within 30 days.`} />
      ) : null}
      <section>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-base font-semibold text-ink">Point batches</h2><span className="text-[10px] text-ink-muted">FEFO spending</span></div>
        <div className="space-y-2">
          {[...batches].sort((a, b) => Date.parse(a.expiresAt) - Date.parse(b.expiresAt)).map((batch) => (
            <article key={batch.id} className="flex items-center justify-between rounded-2xl bg-white p-3 shadow-card">
              <div><p className="text-xs font-semibold text-ink">{formatGP(batch.remaining)}</p><p className="mt-1 flex items-center gap-1 text-[10px] text-ink-muted"><Clock3 size={11} /> Expires {formatShortDate(batch.expiresAt)}</p></div>
              <span className={`rounded-full px-2 py-1 text-[10px] ${now !== null && Date.parse(batch.expiresAt) <= now ? "bg-danger/10 text-danger" : "bg-mint-50 text-primary"}`}>{now !== null && Date.parse(batch.expiresAt) <= now ? "Expired" : `Earned ${formatShortDate(batch.earnedAt)}`}</span>
            </article>
          ))}
        </div>
      </section>
      <section>
        <h2 className="mb-3 text-base font-semibold text-ink">Recent activity</h2>
        <div className="space-y-2">
          {transactions.length ? transactions.map((transaction) => (
            <article key={transaction.id} className="flex items-center gap-3 rounded-2xl bg-white p-3">
              <span className={`flex size-9 items-center justify-center rounded-full ${transaction.kind === "spent" ? "bg-danger/10 text-danger" : "bg-success/10 text-success"}`}><Plus className={transaction.kind === "spent" ? "rotate-45" : ""} size={16} /></span>
              <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-ink">{transaction.label}</p><p className="mt-1 text-[10px] text-ink-muted">{formatShortDate(transaction.createdAt)}</p></div>
              <span className={`text-xs font-semibold ${transaction.kind === "spent" ? "text-danger" : "text-success"}`}>{transaction.kind === "spent" ? "−" : "+"}{formatGP(transaction.amount)}</span>
            </article>
          )) : <p className="rounded-2xl bg-white p-4 text-xs text-ink-muted">Your point activity will appear here.</p>}
        </div>
      </section>
    </main>
  );
}

function ExpiryNotice({ tone, text }: { tone: "danger" | "warning"; text: string }) {
  return <div role="status" className={`rounded-2xl p-3 text-xs font-medium ${tone === "danger" ? "bg-danger/10 text-danger" : "bg-warning/15 text-warning"}`}>{text}</div>;
}
