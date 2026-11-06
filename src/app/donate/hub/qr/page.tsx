"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { Check, Clock3, Phone, RefreshCw, ScanLine } from "lucide-react";
import { HubStepGuard, HubLocationCard, HubPicker } from "@/components/hub/hub-ui";
import { useHubSession } from "@/store/hubSession";
import { QR_TTL_SECONDS } from "@/lib/hub";
import { apiRequest } from "@/lib/api";

function QrContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ttlValue = Number(searchParams.get("ttl"));
  const ttl = Number.isInteger(ttlValue) && ttlValue >= 1 && ttlValue <= 3600 ? ttlValue : null;
  const code = useHubSession((state) => state.code);
  const expiresAt = useHubSession((state) => state.expiresAt);
  const hubId = useHubSession((state) => state.hubId);
  const refreshCode = useHubSession((state) => state.refreshCode);
  const setCodeExpiry = useHubSession((state) => state.setCodeExpiry);
  const donationId = useHubSession((state) => state.donationId);
  const setDonationId = useHubSession((state) => state.setDonationId);
  const markScanned = useHubSession((state) => state.markScanned);
  const [now, setNow] = useState<number | null>(null);
  const [isHubPickerOpen, setIsHubPickerOpen] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [actionError, setActionError] = useState("");
  const appliedDevTtl = useRef(false);
  const showError = actionError;

  useEffect(() => {
    const updateTime = () => setNow(Date.now());
    updateTime();
    const timerId = window.setInterval(updateTime, 1000);
    return () => window.clearInterval(timerId);
  }, []);

  useEffect(() => {
    if (!ttl || appliedDevTtl.current || !code) return;
    appliedDevTtl.current = true;
    setCodeExpiry(ttl);
  }, [code, setCodeExpiry, ttl]);

  useEffect(() => {
    if (!hubId || donationId) return;
    let active = true;
    apiRequest<{ _id: string }>("/api/donations", {
      method: "POST",
      body: JSON.stringify({ hubId }),
    })
      .then((donation) => {
        if (active) setDonationId(donation._id);
      })
      .catch((reason: unknown) => {
        if (active) setActionError(reason instanceof Error ? reason.message : "Could not create donation session.");
      });
    return () => {
      active = false;
    };
  }, [donationId, hubId, setDonationId]);

  const remaining = now === null ? QR_TTL_SECONDS : Math.max(0, Math.ceil((expiresAt - now) / 1000));
  const isExpired = now !== null && remaining === 0;
  const timer = `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`;

  function simulateScan() {
    if (isExpired || isVerifying) return;
    setActionError("");
    setIsVerifying(true);
    window.setTimeout(() => {
      try {
        markScanned();
        router.push("/donate/hub/insert");
      } catch (reason) {
        setActionError(reason instanceof Error ? reason.message : "The Hub could not verify this QR code.");
        setIsVerifying(false);
      }
    }, 450);
  }

  return (
    <HubStepGuard step="qr">
      <main className="flex flex-1 flex-col pt-5">
        <HubLocationCard hubId={hubId} onClick={() => setIsHubPickerOpen(true)} />

        {isExpired && (
          <section aria-live="polite" className="mt-4 rounded-2xl border border-danger/15 bg-red-50 p-4">
            <div className="flex gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-danger"><Clock3 size={19} /></span>
              <div className="min-w-0 flex-1">
                <h1 className="text-sm font-bold text-danger">QR code expired</h1>
                <p className="mt-1 text-xs leading-relaxed text-danger/85">Your code is no longer valid. Please refresh to get a new code.</p>
                <button type="button" onClick={() => { refreshCode(ttl ?? QR_TTL_SECONDS); setNow(Date.now()); setActionError(""); }} className="mt-3 flex min-h-10 items-center justify-center gap-2 rounded-full border border-danger/35 bg-white px-4 text-xs font-semibold text-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger"><RefreshCw size={14} /> Refresh code</button>
              </div>
            </div>
          </section>
        )}

        <section className={`mt-4 rounded-3xl bg-white p-4 shadow-card ${isExpired ? "opacity-55 grayscale" : ""}`}>
          <div className="mx-auto flex w-full max-w-[224px] items-center justify-center rounded-2xl bg-hub-mint p-3">
            <QRCodeSVG value={code || "SWP-PENDING"} size={196} title="Your unique Swap Hub donation QR code" className="h-auto w-full" />
          </div>
          <p className="mx-auto mt-3 w-fit rounded-full bg-hub-mint px-4 py-2 text-sm font-bold tracking-[0.12em] text-hub-ink">{code || "Creating code…"}</p>
          {!isExpired && (
            <div className="mt-4 flex items-center justify-between gap-2">
              <p aria-live="polite" className="flex items-center gap-1.5 text-xs text-hub-muted"><Clock3 size={15} /> Valid for {timer}</p>
              <button type="button" onClick={() => { refreshCode(ttl ?? QR_TTL_SECONDS); setNow(Date.now()); setActionError(""); }} className="flex min-h-10 items-center justify-center gap-1.5 rounded-full border border-hub-primary/35 px-3 text-xs font-semibold text-hub-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hub-primary"><RefreshCw size={13} /> Refresh code</button>
            </div>
          )}
        </section>

        {!isExpired && (
          <>
            <p className="mt-4 flex items-center gap-3 px-1 text-xs leading-relaxed text-hub-muted"><Phone size={20} className="shrink-0 text-hub-primary" /> Hold your phone up to the scanner on the Swap Hub.</p>
            <div aria-live="polite" className="mt-4 flex min-h-11 items-center justify-center gap-2 rounded-full bg-hub-mint px-4 text-xs font-medium text-hub-primary">
              {isVerifying ? <Check size={16} /> : <RefreshCw size={15} className="animate-spin" />}
              {isVerifying ? "QR verified, lid opening…" : "Waiting for the Hub to scan…"}
            </div>
            <div className="my-4 flex items-center gap-3 text-[10px] font-medium text-hub-muted"><span className="h-px flex-1 bg-hub-line" /> OR <span className="h-px flex-1 bg-hub-line" /></div>
            <button type="button" onClick={simulateScan} disabled={isVerifying} className="flex min-h-[60px] w-full items-center justify-center gap-3 rounded-2xl bg-hub-mint px-4 text-sm font-semibold text-hub-primary transition hover:bg-hub-mint-strong disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hub-primary">
              <ScanLine size={21} /> <span>Simulate Hub scan <span className="block text-[10px] font-normal text-hub-muted">(prototype only)</span></span>
            </button>
          </>
        )}
        {showError && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-xs text-danger">{showError}</p>}

        <HubPicker open={isHubPickerOpen} onClose={() => setIsHubPickerOpen(false)} />
      </main>
    </HubStepGuard>
  );
}

export default function DonationQrPage() {
  return (
    <Suspense fallback={<div className="mt-8 text-center text-sm text-hub-muted">Loading QR code…</div>}>
      <QrContent />
    </Suspense>
  );
}
