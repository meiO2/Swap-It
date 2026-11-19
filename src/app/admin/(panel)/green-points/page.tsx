"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";

type ReserveSnapshot = {
  balance: number;
  targetBalance: number;
  warningThreshold: number;
  outstandingLiability: number;
  pendingRefundGp: number;
  reservedRedemptions: number;
  reserveShortfall: number;
  redemptionAllowed: boolean;
  belowWarningThreshold: boolean;
};

type ReserveEntry = {
  _id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  referenceKey: string;
  externalReference?: string;
  note?: string;
  createdAt: string;
};

type PendingCredit = {
  _id: string;
  status: "PENDING_REFUND_GP" | "PENDING_REWARD";
  amount: number;
  description: string;
  referenceKey: string;
  createdAt: string;
};

type ReserveData = {
  reserve: ReserveSnapshot;
  ledger: ReserveEntry[];
  pending: PendingCredit[];
};

function rupiah(amount: number) {
  return `Rp${amount.toLocaleString("id-ID")}`;
}

export default function AdminGreenPointsPage() {
  const [data, setData] = useState<ReserveData | null>(null);
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [externalReference, setExternalReference] = useState("");
  const [note, setNote] = useState("");
  const [confirmedFunded, setConfirmedFunded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await apiRequest<ReserveData>("/api/admin/green-points/reserve"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load GP reserve.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function submitTopUp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedAmount = Number(amount);
    if (!Number.isSafeInteger(parsedAmount) || parsedAmount <= 0) {
      setError("Enter a positive whole-rupiah top-up amount.");
      return;
    }
    if (!confirmedFunded) {
      setError("Confirm that the funds have actually been deposited before recording a top-up.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      await apiRequest("/api/admin/green-points/reserve", {
        method: "POST",
        body: JSON.stringify({
          amount: parsedAmount,
          referenceKey: reference.trim() || `reserve-top-up:${crypto.randomUUID()}`,
          externalReference: externalReference.trim() || undefined,
          note: note.trim() || undefined,
          confirmedFunded,
        }),
      });
      setAmount("");
      setReference("");
      setExternalReference("");
      setNote("");
      setConfirmedFunded(false);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not record top-up.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">Admin / Finance</p>
        <h1 className="mt-1 text-2xl font-bold text-ink">Green Point reserve</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Only record money that has actually been deposited. Refund GP is funded before reward GP.
        </p>
      </header>

      {error && <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p>}
      {loading ? (
        <p role="status" className="rounded-2xl bg-white p-5 text-sm text-ink-muted">Loading reserve…</p>
      ) : data ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Funded reserve" amount={data.reserve.balance} />
            <Metric label="Issued GP liability" amount={data.reserve.outstandingLiability} />
            <Metric label="Pending refund GP" amount={data.reserve.pendingRefundGp} />
            <Metric label="Reserved redemptions" amount={data.reserve.reservedRedemptions} />
          </section>
          <p className={`rounded-xl p-3 text-sm ${data.reserve.belowWarningThreshold || !data.reserve.redemptionAllowed ? "bg-warning/15 text-warning" : "bg-mint-50 text-primary"}`}>
            {!data.reserve.redemptionAllowed
              ? `Redemptions are blocked until reserve shortfall ${rupiah(data.reserve.reserveShortfall)} is funded.`
              : data.reserve.belowWarningThreshold
                ? `Redemptions are covered, but reserve is below the ${rupiah(data.reserve.warningThreshold)} warning threshold.`
                : `Redemptions are covered · Target: ${rupiah(data.reserve.targetBalance)}`}
          </p>

          <form onSubmit={(event) => void submitTopUp(event)} className="space-y-3 rounded-2xl bg-white p-5 shadow-card">
            <h2 className="font-semibold text-ink">Record manual reserve top-up</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-medium text-ink-muted">
                Amount (Rp)
                <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="numeric" required className="mt-1 min-h-11 w-full rounded-xl border border-border px-3 text-sm text-ink" />
              </label>
              <label className="text-xs font-medium text-ink-muted">
                Idempotency/reference key (optional)
                <input value={reference} onChange={(event) => setReference(event.target.value)} maxLength={200} className="mt-1 min-h-11 w-full rounded-xl border border-border px-3 text-sm text-ink" />
              </label>
              <label className="text-xs font-medium text-ink-muted">
                Deposit reference (optional)
                <input value={externalReference} onChange={(event) => setExternalReference(event.target.value)} maxLength={200} className="mt-1 min-h-11 w-full rounded-xl border border-border px-3 text-sm text-ink" />
              </label>
              <label className="text-xs font-medium text-ink-muted">
                Note (optional)
                <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} className="mt-1 min-h-11 w-full rounded-xl border border-border px-3 text-sm text-ink" />
              </label>
            </div>
            <label className="flex items-start gap-2 text-sm text-ink">
              <input type="checkbox" checked={confirmedFunded} onChange={(event) => setConfirmedFunded(event.target.checked)} className="mt-1" />
              I confirm these funds have actually been deposited into the reserve.
            </label>
            <button type="submit" disabled={busy} className="min-h-11 rounded-full bg-primary px-5 text-sm font-semibold text-white disabled:opacity-60">
              {busy ? "Recording…" : "Record top-up"}
            </button>
          </form>

          <section className="space-y-3">
            <h2 className="font-semibold text-ink">Pending Green Point credits</h2>
            {data.pending.map((credit) => (
              <article key={credit._id} className="flex flex-wrap justify-between gap-2 rounded-xl bg-white p-4 text-sm">
                <div>
                  <p className="font-semibold text-ink">{credit.status.replaceAll("_", " ")}</p>
                  <p className="mt-1 text-xs text-ink-muted">{credit.description} · {credit.referenceKey}</p>
                </div>
                <span className="font-semibold text-primary">{credit.amount.toLocaleString("id-ID")} GP</span>
              </article>
            ))}
            {data.pending.length === 0 && <p className="rounded-xl bg-white p-4 text-sm text-ink-muted">No pending GP credits.</p>}
          </section>

          <section className="space-y-3">
            <h2 className="font-semibold text-ink">Reserve ledger</h2>
            {data.ledger.map((entry) => (
              <article key={entry._id} className="flex flex-wrap justify-between gap-2 rounded-xl bg-white p-4 text-sm">
                <div>
                  <p className="font-semibold text-ink">{entry.type.replaceAll("_", " ")}</p>
                  <p className="mt-1 text-xs text-ink-muted">{entry.referenceKey}{entry.externalReference ? ` · ${entry.externalReference}` : ""}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-primary">{rupiah(entry.amount)}</p>
                  <p className="text-xs text-ink-muted">Balance {rupiah(entry.balanceAfter)}</p>
                </div>
              </article>
            ))}
            {data.ledger.length === 0 && <p className="rounded-xl bg-white p-4 text-sm text-ink-muted">No reserve entries yet.</p>}
          </section>
        </>
      ) : null}
    </div>
  );
}

function Metric({ label, amount }: { label: string; amount: number }) {
  return (
    <article className="rounded-2xl bg-white p-4 shadow-card">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="mt-1 text-xl font-bold text-ink">{rupiah(amount)}</p>
    </article>
  );
}
