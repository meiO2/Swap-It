"use client";

import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Clock3, WalletCards } from "lucide-react";
import { useEffect, useState } from "react";
import { formatGP, formatShortDate } from "@/lib/format";
import { apiRequest } from "@/lib/api";

type LedgerEntry = {
  _id: string;
  type: string;
  amount: number;
  description: string;
  expiresAt?: string;
  createdAt: string;
};

type PendingCredit = {
  _id: string;
  status: "PENDING_REFUND_GP" | "PENDING_REWARD";
  amount: number;
  description: string;
  createdAt: string;
};

export default function WalletPage() {
  const [ledgerBalance, setLedgerBalance] = useState<number | null>(null);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [pendingCredits, setPendingCredits] = useState<PendingCredit[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => {
      apiRequest<{
        balance: number;
        entries: LedgerEntry[];
        pendingCredits: PendingCredit[];
      }>("/api/green-points")
        .then((data) => {
          setLedgerBalance(data.balance);
          setLedgerEntries(data.entries);
          setPendingCredits(data.pendingCredits);
        })
        .catch((reason: unknown) => {
          console.error("Could not load Green Point ledger.", reason);
          setError(reason instanceof Error ? reason.message : "Could not load your wallet.");
        });
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <main className="space-y-5 px-4 pb-6 pt-5">
      <header className="flex items-center gap-3"><Link href="/profile" aria-label="Back to profile" className="rounded-full p-2 text-ink-muted hover:bg-mint-50"><ArrowLeft size={20} /></Link><div><h1 className="text-xl font-semibold text-ink">Green Point wallet</h1><p className="text-xs text-ink-muted">Your circularity, in points</p></div></header>
      <section className="rounded-3xl bg-primary p-5 text-white shadow-primary">
        <p className="flex items-center gap-2 text-xs text-white/85"><WalletCards size={16} /> Total balance</p>
        <p className="mt-2 text-3xl font-bold">{ledgerBalance === null ? "—" : formatGP(ledgerBalance)}</p>
        <p className="mt-1 text-xs text-white/80">1 GP = Rp1 · Not cash, not withdrawable or transferable</p>
        <Link href="/cart" className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-semibold text-primary">Use points <ArrowUpRight size={14} /></Link>
      </section>
      {error && <p role="alert" className="rounded-xl bg-danger/10 p-3 text-xs text-danger">{error}</p>}
      {pendingCredits.length > 0 && (
        <section className="space-y-2" aria-label="Pending Green Point credits">
          <h2 className="text-base font-semibold text-ink">Pending credits</h2>
          {pendingCredits.map((credit) => (
            <article key={credit._id} className="flex items-start justify-between gap-3 rounded-2xl bg-warning/10 p-3">
              <div>
                <p className="text-xs font-semibold text-ink">
                  {credit.status === "PENDING_REFUND_GP" ? "Refund GP pending" : "Reward GP pending"}
                </p>
                <p className="mt-1 text-[10px] text-ink-muted">{credit.description}</p>
              </div>
              <span className="shrink-0 text-xs font-semibold text-ink">{formatGP(credit.amount)}</span>
            </article>
          ))}
        </section>
      )}
      <section>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-base font-semibold text-ink">Green Point ledger</h2><span className="text-[10px] text-ink-muted">Issued entries</span></div>
        <div className="space-y-2">
          {ledgerEntries.map((entry) => (
            <article key={entry._id} className="flex items-center justify-between rounded-2xl bg-white p-3 shadow-card">
              <div><p className="text-xs font-semibold text-ink">{entry.description}</p><p className="mt-1 flex items-center gap-1 text-[10px] text-ink-muted"><Clock3 size={11} /> {formatShortDate(entry.createdAt)} · {entry.type}</p></div>
              <span className={`rounded-full px-2 py-1 text-[10px] ${entry.amount < 0 ? "bg-danger/10 text-danger" : "bg-mint-50 text-primary"}`}>{entry.amount > 0 ? "+" : ""}{formatGP(entry.amount)}</span>
            </article>
          ))}
          {ledgerBalance === null && !error && <p role="status" className="rounded-2xl bg-white p-4 text-xs text-ink-muted">Loading Green Point ledger…</p>}
          {ledgerBalance !== null && ledgerEntries.length === 0 && <p className="rounded-2xl bg-white p-4 text-xs text-ink-muted">Your Green Point ledger is empty.</p>}
        </div>
      </section>
    </main>
  );
}
