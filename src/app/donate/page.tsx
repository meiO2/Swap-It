"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, Box, Gift, Leaf, MapPin, QrCode, Shirt, Star, X } from "lucide-react";
import { OPEN_DONATION_BOX_IMAGE } from "@/lib/assets";
import { StepRow, StickyActions, hubPrimaryButton, useSwapHubs } from "@/components/hub/hub-ui";
import { useHubSession } from "@/store/hubSession";
import { apiRequest } from "@/lib/api";
import { formatGP } from "@/lib/format";

type DonationSummary = {
  _id: string;
  hubId: string;
  status: string;
  totalItems: number;
  donorReportedItems: number;
  gpAwarded: number;
  createdAt: string;
};

export default function DonatePage() {
  const router = useRouter();
  const startSession = useHubSession((state) => state.startSession);
  const [donations, setDonations] = useState<DonationSummary[]>([]);
  const [historyError, setHistoryError] = useState("");
  const [historyLoading, setHistoryLoading] = useState(true);
  const { hubs, loading } = useSwapHubs();
  const nearestHub = hubs[0];

  useEffect(() => {
    let active = true;
    apiRequest<DonationSummary[]>("/api/donations")
      .then((data) => { if (active) setDonations(data); })
      .catch((reason: unknown) => {
        if (active) setHistoryError(reason instanceof Error ? reason.message : "Could not load donation history.");
      })
      .finally(() => { if (active) setHistoryLoading(false); });
    return () => { active = false; };
  }, []);

  if (loading) {
    return <main className="p-6"><p className="text-sm text-hub-muted">Loading Swap Hubs…</p></main>;
  }
  if (!nearestHub) {
    return <main className="p-6"><h1 className="text-xl font-bold">Donation is unavailable</h1><p className="mt-2 text-sm text-hub-muted">No Swap Hub is configured yet.</p><button type="button" onClick={() => router.push("/")} className="mt-5 rounded-full bg-hub-primary px-5 py-3 text-sm font-semibold text-white">Back home</button></main>;
  }

  function beginDonation() {
    startSession(nearestHub.id);
    router.push("/donate/hub/qr");
  }

  return (
    <main className="flex min-h-dvh flex-col bg-hub-bg px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] text-hub-ink">
      <div className="mx-auto flex w-full max-w-[430px] flex-1 flex-col">
        <header className="flex h-11 items-center justify-between">
          <button type="button" onClick={() => router.push("/")} aria-label="Close donation" className="flex size-11 items-center justify-center rounded-full text-hub-ink hover:bg-hub-mint focus-visible:outline-2 focus-visible:outline-hub-primary"><X size={23} /></button>
          <span className="flex items-center gap-1.5 text-xs font-semibold text-hub-primary"><Leaf size={15} fill="currentColor" /> Donate</span>
        </header>

        <section className="relative -mx-1 mt-2 min-h-[226px] overflow-hidden rounded-3xl px-1">
          <div className="absolute inset-y-3 right-0 w-1/2 rounded-[45%] bg-hub-mint" />
          <div className="absolute right-0 top-0 h-full w-[58%]">
            <Image src={OPEN_DONATION_BOX_IMAGE} alt="Open green Swap Hub donation box with a plant" fill priority sizes="(max-width: 430px) 58vw, 250px" className="object-contain object-right" />
          </div>
          <div className="relative z-10 flex min-h-[226px] max-w-[62%] flex-col justify-center py-4">
            <h1 className="text-[27px] font-bold leading-[1.13] tracking-tight">Give your clothes a second life</h1>
            <p className="mt-3 text-xs leading-relaxed text-hub-muted">Drop off your preloved clothes at the Swap Hub and earn Green Points. It&apos;s easy, convenient, and makes a real impact.</p>
          </div>
        </section>

        <button type="button" onClick={beginDonation} className="mt-4 flex min-h-[112px] w-full items-center gap-3 rounded-3xl bg-hub-mint p-4 text-left transition hover:bg-hub-mint-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hub-primary">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-hub-mint-strong text-hub-primary"><Gift size={26} strokeWidth={1.75} /><Leaf size={12} className="-ml-2 mt-4" /></span>
          <span className="min-w-0 flex-1"><span className="block text-base font-semibold">Start donation</span><span className="mt-1 block text-xs leading-relaxed text-hub-muted">Begin the donation process at the nearest Swap Hub.</span></span>
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-hub-primary text-white"><ArrowRight size={20} /></span>
        </button>

        <section className="mt-6">
          <h2 className="text-lg font-bold">How it works</h2>
          <p className="mt-1 text-xs text-hub-muted">It only takes a few simple steps.</p>
          <ol className="mt-2">
            <StepRow number={1} icon={<QrCode size={20} />} title="Show your QR code" detail="Display your unique QR code at the Hub scanner." />
            <StepRow number={2} icon={<Box size={20} />} title="The Hub scans it and the lid opens" detail="The machine verifies your code and opens the lid." />
            <StepRow number={3} icon={<Shirt size={20} />} title="Put your clothes in and enter the quantity" detail="Insert your items one by one and tell us how many pieces." />
            <StepRow number={4} icon={<Star size={20} />} title="Admin verifies your items" detail="Green Points are awarded after quality classification." last />
          </ol>
        </section>

        <section className="mt-6" aria-labelledby="donation-history-title">
          <h2 id="donation-history-title" className="text-lg font-bold">Your donation progress</h2>
          <p className="mt-1 text-xs text-hub-muted">Final Green Points are based on the administrator&apos;s item classifications.</p>
          {historyError && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-xs text-danger">{historyError}</p>}
          {historyLoading && <p role="status" className="mt-3 rounded-2xl bg-white p-4 text-xs text-hub-muted shadow-card">Loading donation progress…</p>}
          {!historyLoading && !historyError && donations.length === 0 && <p className="mt-3 rounded-2xl bg-white p-4 text-xs text-hub-muted shadow-card">No donation sessions yet.</p>}
          <div className="mt-3 space-y-2">
            {donations.slice(0, 5).map((donation) => (
              <article key={donation._id} className="rounded-2xl bg-white p-4 shadow-card">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-hub-ink">
                      {donation.status === "COMPLETED" || donation.status === "REWARD_GRANTED" ? "Completed" :
                        donation.status === "UNDER_VERIFICATION" || donation.status === "PENDING" ? "Awaiting quality verification" :
                          donation.status === "CANCELLED" ? "Cancelled" :
                            donation.status === "DISCREPANCY_REVIEW" ? "Needs Hub review" : "In progress"}
                    </p>
                    <p className="mt-1 text-[10px] text-hub-muted">{donation.donorReportedItems || donation.totalItems} item(s) · Hub {donation.hubId} · {new Date(donation.createdAt).toLocaleDateString("id-ID")}</p>
                  </div>
                  {(donation.status === "COMPLETED" || donation.status === "REWARD_GRANTED") && <span className="whitespace-nowrap text-sm font-bold text-hub-primary">{formatGP(donation.gpAwarded)} GP</span>}
                </div>
              </article>
            ))}
          </div>
        </section>

        <a href="/map" className="mt-4 flex min-h-[76px] items-center gap-3 rounded-2xl bg-hub-mint p-3 transition hover:bg-hub-mint-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hub-primary">
          <span className="flex size-10 shrink-0 items-center justify-center text-hub-primary"><MapPin size={22} /></span>
          <span className="min-w-0 flex-1"><span className="block text-[10px] text-hub-muted">Nearest Swap Hub</span><span className="mt-0.5 block text-sm font-semibold">{nearestHub.name}</span><span className="block text-xs text-hub-muted">{nearestHub.address}</span></span>
          <span aria-hidden="true" className="text-xl text-hub-muted">›</span>
        </a>

        <StickyActions>
          <button type="button" onClick={() => router.push("/map")} className={hubPrimaryButton}>Look For The Nearest Drop Off Point <ArrowRight size={17} /></button>
        </StickyActions>
      </div>
    </main>
  );
}
