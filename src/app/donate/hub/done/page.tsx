"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Check, Home, Newspaper, WalletCards } from "lucide-react";
import { HubStepGuard, StickyActions, hubPrimaryButton, hubSecondaryButton } from "@/components/hub/hub-ui";
import { formatGP } from "@/lib/format";
import { useHubSession } from "@/store/hubSession";
import { apiRequest } from "@/lib/api";

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
  const itemCount = useHubSession((state) => state.itemCount);
  const status = useHubSession((state) => state.status);
  const donationId = useHubSession((state) => state.donationId);
  const [donation, setDonation] = useState<{ status: string; gpAwarded: number; donorReportedItems: number } | null>(null);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (status !== "confirmed" || !donationId || !itemCount) return;
    let active = true;
    const refresh = async () => {
      try {
        const path = `/api/donations/${encodeURIComponent(donationId)}`;
        let current = await apiRequest<{ status: string; gpAwarded: number; donorReportedItems: number }>(path);
        if (current.status === "QR_SCANNED" || current.status === "UNDER_VERIFICATION") {
          current = await apiRequest<{ status: string; gpAwarded: number; donorReportedItems: number }>(`${path}/complete`, {
            method: "POST",
            body: JSON.stringify({ itemCount }),
          });
        }
        if (active) setDonation(current);
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Could not update donation progress.");
      }
    };
    void refresh();
    const timerId = window.setInterval(() => void refresh(), 4000);
    return () => {
      active = false;
      window.clearInterval(timerId);
    };
  }, [donationId, itemCount, status]);

  useEffect(() => {
    if (donation?.status !== "COMPLETED") return;
    apiRequest<{ balance: number }>("/api/green-points")
      .then((data) => setWalletBalance(data.balance))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load Green Point balance."));
  }, [donation?.status]);

  const isComplete = donation?.status === "COMPLETED" || donation?.status === "REWARD_GRANTED";
  const reportedItems = donation?.donorReportedItems || itemCount;
  const progressMessage = isComplete
    ? "Your donation has been verified and finalized."
    : donation?.status === "UNDER_VERIFICATION" || donation?.status === "PENDING"
      ? "Your items are awaiting administrator quality verification. Green Points will be awarded after review."
      : donation?.status === "CANCELLED"
        ? "This donation session was cancelled."
        : "Waiting for the Swap Hub to confirm that your deposit is complete.";

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
        <h1 className="mt-1 text-[25px] font-bold leading-tight">{isComplete ? "Donation completed!" : "Donation progress"}</h1>
        <p className="mt-2 max-w-xs text-sm leading-relaxed text-hub-muted">{progressMessage}</p>

        <section className="mt-6 w-full rounded-3xl bg-white p-4 text-left shadow-card" aria-live="polite">
          <SummaryRow label="Reported items" value={`${reportedItems} ${reportedItems === 1 ? "piece" : "pieces"}`} />
          <SummaryRow label="Donation status" value={isComplete ? "Completed" : donation?.status === "UNDER_VERIFICATION" || donation?.status === "PENDING" ? "Awaiting verification" : "Awaiting Hub confirmation"} />
          <SummaryRow label="Final GP awarded" value={isComplete ? formatGP(donation.gpAwarded) : "After quality verification"} />
          {isComplete && <SummaryRow label="Wallet balance" value={walletBalance === null ? "Loading…" : formatGP(walletBalance)} last />}
        </section>
        {error && <p role="alert" className="mt-3 w-full rounded-xl bg-red-50 p-3 text-left text-xs text-danger">{error}</p>}
        <StickyActions>
          <Link href={isComplete ? "/wallet" : "/donate"} className={hubPrimaryButton}><WalletCards size={17} /> {isComplete ? "View wallet" : "View donation progress"}</Link>
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
