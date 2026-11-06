"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MapPin } from "lucide-react";
import { useHubSession } from "@/store/hubSession";
import { useSwapStore } from "@/store/useSwapStore";
import type { SwapHub } from "@/lib/hubs";
import { apiRequest } from "@/lib/api";

export const hubPrimaryButton = "flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-hub-primary px-5 text-sm font-semibold text-white shadow-primary transition hover:bg-hub-primary-dark disabled:pointer-events-none disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hub-primary";
export const hubSecondaryButton = "flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-hub-primary bg-white px-5 text-sm font-semibold text-hub-primary transition hover:bg-hub-mint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hub-primary";

export function useSwapHubs() {
  const [hubs, setHubs] = useState<SwapHub[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    apiRequest<SwapHub[]>("/api/hubs")
      .then((data) => {
        if (active) setHubs(data);
      })
      .catch((reason: unknown) => {
        console.error("Could not load Swap Hubs.", reason);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return { hubs, loading };
}

export function useHubHydration() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void Promise.all([useHubSession.persist.rehydrate(), useSwapStore.persist.rehydrate()]).then(
      () => { if (active) setReady(true); },
      (reason: unknown) => {
        console.error("Could not restore the donation session.", reason);
        if (active) {
          setError(reason instanceof Error ? reason.message : "The donation session could not be restored.");
          setReady(true);
        }
      },
    );
    return () => { active = false; };
  }, []);

  return { ready, error };
}

export function HubStepGuard({ step, children }: { step: "qr" | "insert" | "confirm" | "done"; children: ReactNode }) {
  const router = useRouter();
  const { ready, error } = useHubHydration();
  const status = useHubSession((state) => state.status);
  const expiresAt = useHubSession((state) => state.expiresAt);
  const itemCount = useHubSession((state) => state.itemCount);
  const donationReceipts = useSwapStore((state) => state.donationReceipts);
  const startSession = useHubSession((state) => state.startSession);
  const [now, setNow] = useState(0);

  useEffect(() => {
    let timerId: number | undefined;
    const initialTimer = window.setTimeout(() => {
      setNow(Date.now());
      timerId = window.setInterval(() => setNow(Date.now()), 1000);
    }, 0);
    return () => {
      window.clearTimeout(initialTimer);
      if (timerId) window.clearInterval(timerId);
    };
  }, []);

  useEffect(() => {
    if (!ready || error) return;
    if (step === "qr" && status === "idle") {
      startSession();
      return;
    }
    if (step === "insert" && !((status === "scanned" || status === "confirmed") && expiresAt > Date.now())) {
      router.replace("/donate/hub/qr");
    } else if (step === "confirm" && !((status === "scanned" || status === "confirmed") && itemCount >= 1 && itemCount <= 30)) {
      router.replace("/donate/hub/insert");
    } else if (step === "done" && status !== "confirmed" && !(status === "idle" && donationReceipts.length > 0)) {
      router.replace("/donate");
    }
  }, [donationReceipts.length, error, expiresAt, itemCount, now, ready, router, startSession, status, step]);

  const isAllowed =
    step === "qr" ? status !== "idle" :
    step === "insert" ? (status === "scanned" || status === "confirmed") && now > 0 && expiresAt > now :
    step === "confirm" ? (status === "scanned" || status === "confirmed") && itemCount >= 1 && itemCount <= 30 :
    status === "confirmed" || (status === "idle" && donationReceipts.length > 0);

  if (error) return <p role="alert" className="mx-auto mt-8 w-full max-w-[430px] rounded-2xl bg-red-50 p-4 text-sm text-danger">{error}</p>;
  if (!ready || !isAllowed) return <div aria-live="polite" className="mx-auto mt-8 w-full max-w-[430px] text-center text-sm text-hub-muted">Loading donation…</div>;
  return <>{children}</>;
}

export function HubLocationCard({ hubId, onClick }: { hubId: string; onClick?: () => void }) {
  const { hubs, loading } = useSwapHubs();
  const swapHubs = hubs;
  const hub = swapHubs.find((item) => item.id === hubId) ?? swapHubs[0];
  if (loading) return <p className="rounded-2xl bg-hub-mint p-3 text-xs text-hub-muted">Loading Swap Hubs…</p>;
  if (!hub) return <p className="rounded-2xl bg-hub-mint p-3 text-xs text-hub-muted">No Swap Hub is configured yet.</p>;
  const contents = (
    <>
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-hub-mint text-hub-primary">
        <MapPin size={20} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-[10px] text-hub-muted">Hub location</span>
        <span className="mt-0.5 block truncate text-sm font-semibold">{hub.name}</span>
        <span className="block truncate text-xs text-hub-muted">{hub.address}</span>
      </span>
      <span aria-hidden="true" className="text-xl text-hub-muted">›</span>
    </>
  );
  const className = "flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left shadow-card transition hover:bg-hub-mint/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hub-primary";

  return onClick ? (
    <button type="button" onClick={onClick} className={className} aria-label={`Choose Hub location. Current location: ${hub.name}, ${hub.address}`}>{contents}</button>
  ) : (
    <Link href="/map" className={className}>{contents}</Link>
  );
}

export function HubPicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { hubs } = useSwapHubs();
  const selectedHubId = useHubSession((state) => state.hubId);
  const setHubId = useHubSession((state) => state.setHubId);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-hub-ink/35 p-4" role="presentation" onClick={onClose}>
      <section aria-labelledby="hub-picker-title" aria-modal="true" role="dialog" className="w-full max-w-[430px] rounded-3xl bg-white p-5 shadow-card" onClick={(event) => event.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 id="hub-picker-title" className="text-lg font-semibold">Choose a Swap Hub</h2>
          <button type="button" onClick={onClose} aria-label="Close Hub picker" className="flex size-11 items-center justify-center rounded-full text-hub-muted focus-visible:outline-2 focus-visible:outline-hub-primary">×</button>
        </div>
        <div className="space-y-2">
          {hubs.map((hub) => (
            <button key={hub.id} type="button" onClick={() => { setHubId(hub.id); onClose(); }} aria-pressed={selectedHubId === hub.id} className={`flex min-h-14 w-full items-center justify-between rounded-2xl border p-3 text-left ${selectedHubId === hub.id ? "border-hub-primary bg-hub-mint" : "border-border bg-white"}`}>
              <span><span className="block text-sm font-semibold">{hub.name}</span><span className="block text-xs text-hub-muted">{hub.address} · {hub.distance}</span></span>
              {selectedHubId === hub.id && <span className="text-sm font-bold text-hub-primary" aria-hidden="true">✓</span>}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

export function StickyActions({ children }: { children: ReactNode }) {
  return <div className="sticky bottom-0 mt-auto space-y-3 bg-hub-bg/95 pb-1 pt-4 backdrop-blur-sm">{children}</div>;
}

export function StepRow({ number, icon, title, detail, last = false }: { number: number; icon: ReactNode; title: string; detail: string; last?: boolean }) {
  return (
    <li className={`flex gap-3 py-3 ${last ? "" : "border-b border-hub-line"}`}>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-hub-mint text-sm font-semibold text-hub-primary">{number}</span>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-hub-primary">{icon}</span>
      <span className="min-w-0 flex-1 pt-0.5"><span className="block text-sm font-semibold">{title}</span><span className="mt-0.5 block text-xs leading-relaxed text-hub-muted">{detail}</span></span>
    </li>
  );
}

export function SummaryRow({ icon, label, value, detail, last = false }: { icon: ReactNode; label: string; value: string; detail?: string; last?: boolean }) {
  return (
    <div className={`flex items-start gap-3 py-3 ${last ? "" : "border-b border-hub-line"}`}>
      <span className="flex size-8 shrink-0 items-center justify-center text-hub-primary">{icon}</span>
      <span className="min-w-0 flex-1"><span className="block text-[10px] text-hub-muted">{label}</span><span className="mt-0.5 block text-sm font-semibold">{value}</span>{detail && <span className="mt-0.5 block text-xs text-hub-muted">{detail}</span>}</span>
    </div>
  );
}
