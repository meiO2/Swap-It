"use client";

import { useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, X } from "lucide-react";
import { useHubSession } from "@/store/hubSession";

const steps = [
  { suffix: "/qr", title: "Show your QR" },
  { suffix: "/insert", title: "Insert clothes" },
  { suffix: "/confirm", title: "Review & confirm" },
  { suffix: "/done", title: "Donation complete" },
];

export default function HubStepShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const reset = useHubSession((state) => state.reset);
  const [showCancel, setShowCancel] = useState(false);
  const step = Math.max(0, steps.findIndex(({ suffix }) => pathname.endsWith(suffix)));
  const currentStep = steps[step];

  function cancelDonation() {
    reset();
    setShowCancel(false);
    router.replace("/donate");
  }

  return (
    <div className="flex min-h-dvh flex-col bg-hub-bg px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] text-hub-ink">
      <header className="mx-auto flex w-full max-w-[430px] items-center justify-between gap-4">
        <button type="button" aria-label="Cancel donation" onClick={() => setShowCancel(true)} className="flex size-11 items-center justify-center rounded-full text-hub-ink transition hover:bg-hub-mint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hub-primary">
          <X size={23} />
        </button>
        <div className="w-32">
          <p className="text-right text-[11px] font-medium text-hub-muted">Step {step + 1} of 4</p>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white">
            <div className="h-full rounded-full bg-hub-primary transition-[width]" style={{ width: `${((step + 1) / 4) * 100}%` }} />
          </div>
        </div>
      </header>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={pathname}
          initial={{ opacity: 0, x: 8 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -8 }}
          transition={{ duration: 0.18 }}
          className="mx-auto flex w-full max-w-[430px] flex-1 flex-col"
        >
          <p className="sr-only">{currentStep?.title}</p>
          {children}
        </motion.div>
      </AnimatePresence>

      {showCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-hub-ink/35 p-5" role="presentation" onClick={() => setShowCancel(false)}>
          <section aria-labelledby="cancel-donation-title" aria-modal="true" role="dialog" className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-card" onClick={(event) => event.stopPropagation()}>
            <h2 id="cancel-donation-title" className="text-lg font-semibold">Cancel this donation?</h2>
            <p className="mt-2 text-sm text-hub-muted">Your current QR code and donation details will be cleared.</p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setShowCancel(false)} className="min-h-11 rounded-full border border-hub-primary bg-white px-4 text-sm font-semibold text-hub-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hub-primary">Keep going</button>
              <button type="button" onClick={cancelDonation} className="min-h-11 rounded-full bg-hub-primary px-4 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hub-primary">Cancel donation</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export function BackLink({ href }: { href: string }) {
  const router = useRouter();
  return (
    <button type="button" onClick={() => router.push(href)} aria-label="Go back" className="flex size-11 items-center justify-center rounded-full text-hub-ink transition hover:bg-hub-mint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hub-primary">
      <ArrowLeft size={21} />
    </button>
  );
}
