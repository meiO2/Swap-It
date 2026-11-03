"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Check, Home, Newspaper, WalletCards } from "lucide-react";
import { HubStepGuard, StickyActions, hubPrimaryButton, hubSecondaryButton } from "@/components/hub/hub-ui";
import { GP_PER_ITEM } from "@/lib/hub";
import { formatGP } from "@/lib/format";
import { useHubSession } from "@/store/hubSession";
import { useSwapStore } from "@/store/useSwapStore";
import { getAvailablePointBalance } from "@/lib/gp";

const confetti = [
  { left: "13%", top: "38%", color: "bg-hub-primary", rotate: -22 },
  { left: "24%", top: "12%", color: "bg-emerald-300", rotate: 18 },
  { left: "39%", top: "4%", color: "bg-hub-primary", rotate: 42 },
  { right: "34%", top: "2%", color: "bg-amber-300", rotate: -18 },
  { right: "17%", top: "14%", color: "bg-emerald-400", rotate: 25 },
  { right: "10%", top: "39%", color: "bg-amber-300", rotate: 48 },
  { left: "17%", top: "57%", color: "bg-emerald-400", rotate: 10 },
  { right: "15%", top: "58%", color: "bg-hub-primary", rotate: -35 },
];

function DoneContent() {
  const status = useHubSession((state) => state.status);
  const code = useHubSession((state) => state.code);
  const itemCount = useHubSession((state) => state.itemCount);
  const reset = useHubSession((state) => state.reset);
  const addDonationReward = useSwapStore((state) => state.addDonationReward);
  const pointBatches = useSwapStore((state) => state.pointBatches);
  const donationReceipts = useSwapStore((state) => state.donationReceipts);
  const [now, setNow] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const timerId = window.setTimeout(() => setNow(Date.now()), 0);
    return () => window.clearTimeout(timerId);
  }, []);

  useEffect(() => {
    if (status !== "confirmed" || !code || !itemCount) return;
    const amount = itemCount * GP_PER_ITEM;
    try {
      addDonationReward(code, itemCount, amount, new Date());
      reset();
    } catch (reason) {
      console.error("Could not credit the donation reward.", reason);
      const message = reason instanceof Error ? reason.message : "The donation reward could not be added.";
      window.setTimeout(() => setError(message), 0);
    }
  }, [addDonationReward, code, itemCount, reset, status]);

  const summary = donationReceipts.find((receipt) => receipt.id === code) ?? donationReceipts[donationReceipts.length - 1];
  const walletBalance = now === null ? 0 : getAvailablePointBalance(pointBatches, new Date(now));

  return (
    <HubStepGuard step="done">
      <main className="flex flex-1 flex-col items-center pt-10 text-center">
        <div className="relative flex size-52 items-center justify-center">
          {confetti.map((piece, index) => (
            <motion.span
              key={index}
              aria-hidden="true"
              className={`absolute h-2.5 w-2.5 rounded-sm ${piece.color}`}
              style={{ left: piece.left, right: piece.right, top: piece.top, rotate: piece.rotate }}
              animate={{ opacity: [0.35, 1, 0.35], y: [0, -4, 0], rotate: [piece.rotate - 8, piece.rotate + 8, piece.rotate - 8] }}
              transition={{ duration: 2.4 + index * 0.08, repeat: Infinity, delay: index * 0.1 }}
            />
          ))}
          <div className="flex size-28 items-center justify-center rounded-full bg-hub-primary text-white shadow-primary"><Check size={56} strokeWidth={3} /></div>
        </div>
        <h1 className="mt-1 text-[25px] font-bold leading-tight">Thank you for donating!</h1>
        <p className="mt-2 max-w-xs text-sm leading-relaxed text-hub-muted">Your clothes are on their way to a second life.</p>

        <section className="mt-6 w-full rounded-3xl bg-white p-4 text-left shadow-card" aria-live="polite">
          <SummaryRow label="Items donated" value={summary ? `${summary.itemCount} ${summary.itemCount === 1 ? "piece" : "pieces"}` : "Updating…"} />
          <SummaryRow label="GP added" value={summary ? formatGP(summary.amount) : "Updating…"} />
          <SummaryRow label="New wallet balance" value={now === null ? "Updating…" : formatGP(walletBalance)} last />
        </section>
        {error && <p role="alert" className="mt-3 w-full rounded-xl bg-red-50 p-3 text-left text-xs text-danger">{error}</p>}

        <StickyActions>
          <Link href="/wallet" className={hubPrimaryButton}><WalletCards size={17} /> View wallet</Link>
          <Link href="/news" className={hubSecondaryButton}><Newspaper size={17} /> Read Swap News</Link>
          <Link href="/" className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-hub-mint px-5 text-sm font-semibold text-hub-primary transition hover:bg-hub-mint-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hub-primary"><Home size={17} /> Back to Home</Link>
        </StickyActions>
      </main>
    </HubStepGuard>
  );
}

function SummaryRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return <div className={`flex items-center justify-between gap-3 py-3 ${last ? "" : "border-b border-hub-line"}`}><span className="text-xs text-hub-muted">{label}</span><span className="text-sm font-bold text-hub-ink">{value}</span></div>;
}

export default function DonationDonePage() {
  return <DoneContent />;
}
