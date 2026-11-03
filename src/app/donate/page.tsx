"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowRight, Box, Gift, Leaf, MapPin, QrCode, Shirt, Star, X } from "lucide-react";
import { OPEN_DONATION_BOX_IMAGE } from "@/lib/assets";
import { swapHubs } from "@/data/mock";
import { StepRow, StickyActions, hubPrimaryButton } from "@/components/hub/hub-ui";
import { useHubSession } from "@/store/hubSession";

export default function DonatePage() {
  const router = useRouter();
  const startSession = useHubSession((state) => state.startSession);
  const nearestHub = swapHubs[0];

  function beginDonation() {
    startSession();
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
            <StepRow number={4} icon={<Star size={20} />} title="Confirm and receive Green Points" detail="Review your details and get your points instantly." last />
          </ol>
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
