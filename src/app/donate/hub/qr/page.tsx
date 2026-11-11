"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { Check, Clock3, Phone, RefreshCw, ScanLine } from "lucide-react";
import { HubStepGuard, HubLocationCard } from "@/components/hub/hub-ui";
import { useHubSession } from "@/store/hubSession";
import { QR_TTL_SECONDS } from "@/lib/hub";
import { apiRequest } from "@/lib/api";

type DonationRecord = { status: string };

function QrContent() {
  const router = useRouter();
  const code = useHubSession((state) => state.code);
  const expiresAt = useHubSession((state) => state.expiresAt);
  const hubId = useHubSession((state) => state.hubId);
  const sessionKey = useHubSession((state) => state.sessionKey);
  const donationId = useHubSession((state) => state.donationId);
  const setDonationId = useHubSession((state) => state.setDonationId);
  const setQrCredential = useHubSession((state) => state.setQrCredential);
  const markScanned = useHubSession((state) => state.markScanned);
  const markHubScanned = useHubSession((state) => state.markHubScanned);
  const [now, setNow] = useState<number | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [actionError, setActionError] = useState("");
  const qrRequestInFlight = useRef(false);
  const showError = actionError;

  useEffect(() => {
    const updateTime = () => setNow(Date.now());
    updateTime();
    const timerId = window.setInterval(updateTime, 1000);
    return () => window.clearInterval(timerId);
  }, []);

  useEffect(() => {
    if (!hubId || !sessionKey || donationId) return;
    let active = true;
    apiRequest<{ _id: string }>("/api/donations", {
      method: "POST",
      body: JSON.stringify({ hubId, sessionId: sessionKey }),
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
  }, [donationId, hubId, sessionKey, setDonationId]);

  const issueQrCode = useCallback(async () => {
    if (!donationId || qrRequestInFlight.current) return;
    qrRequestInFlight.current = true;
    setIsGenerating(true);
    setActionError("");
    try {
      const credential = await apiRequest<{ token: string; expiresAt: string }>("/api/hubs/access-token", {
        method: "POST",
        body: JSON.stringify({ activity: "DONATION", hubId, donationId }),
      });
      setQrCredential(credential.token, Date.parse(credential.expiresAt));
      setNow(Date.now());
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "Could not generate a secure Hub QR code.");
    } finally {
      qrRequestInFlight.current = false;
      setIsGenerating(false);
    }
  }, [donationId, hubId, setQrCredential]);

  useEffect(() => {
    if (!donationId || code) return;
    const timerId = window.setTimeout(() => void issueQrCode(), 0);
    return () => window.clearTimeout(timerId);
  }, [code, donationId, issueQrCode]);

  useEffect(() => {
    if (!donationId || !code) return;
    let active = true;
    const checkStatus = async () => {
      try {
        const donation = await apiRequest<DonationRecord>(`/api/donations/${encodeURIComponent(donationId)}`);
        if (!active) return;
        if (donation.status === "QR_SCANNED" || donation.status === "UNDER_VERIFICATION") {
          markHubScanned();
          router.push("/donate/hub/insert");
        }
      } catch (reason) {
        if (active) setActionError(reason instanceof Error ? reason.message : "Could not check the donation status.");
      }
    };
    void checkStatus();
    const timerId = window.setInterval(() => void checkStatus(), 2500);
    return () => {
      active = false;
      window.clearInterval(timerId);
    };
  }, [code, donationId, markHubScanned, router]);

  const remaining = !expiresAt || now === null ? QR_TTL_SECONDS : Math.max(0, Math.ceil((expiresAt - now) / 1000));
  const isExpired = Boolean(code) && now !== null && remaining === 0;
  const timer = `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`;

  function simulateScan() {
    if (isExpired || isVerifying) return;
    setActionError("Prototype-only scan: this does not verify a Hub deposit. Use the ESP32 scanner for a real donation.");
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
        <HubLocationCard hubId={hubId} />

        {isExpired && (
          <section aria-live="polite" className="mt-4 rounded-2xl border border-danger/15 bg-red-50 p-4">
            <div className="flex gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-danger"><Clock3 size={19} /></span>
              <div className="min-w-0 flex-1">
                <h1 className="text-sm font-bold text-danger">QR code expired</h1>
                <p className="mt-1 text-xs leading-relaxed text-danger/85">Your code is no longer valid. Please refresh to get a new code.</p>
                <button type="button" onClick={() => void issueQrCode()} disabled={isGenerating} className="mt-3 flex min-h-10 items-center justify-center gap-2 rounded-full border border-danger/35 bg-white px-4 text-xs font-semibold text-danger disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger"><RefreshCw size={14} /> Refresh code</button>
              </div>
            </div>
          </section>
        )}

        <section className={`mt-4 rounded-3xl bg-white p-4 shadow-card ${isExpired ? "opacity-55 grayscale" : ""}`}>
          <div className="mx-auto flex w-full max-w-[224px] items-center justify-center rounded-2xl bg-hub-mint p-3">
            {code ? <QRCodeSVG value={code} size={196} title="Your unique Swap Hub donation QR code" className="h-auto w-full" /> : <p className="p-8 text-center text-xs text-hub-muted">Generating secure QR code…</p>}
          </div>
          <p className="mx-auto mt-3 w-fit rounded-full bg-hub-mint px-4 py-2 text-sm font-bold tracking-[0.12em] text-hub-ink">{code ? "Secure Hub QR ready" : "Creating secure code…"}</p>
          {!isExpired && (
            <div className="mt-4 flex items-center justify-between gap-2">
              <p aria-live="polite" className="flex items-center gap-1.5 text-xs text-hub-muted"><Clock3 size={15} /> Valid for {timer}</p>
              <button type="button" onClick={() => void issueQrCode()} disabled={isGenerating || !donationId} className="flex min-h-10 items-center justify-center gap-1.5 rounded-full border border-hub-primary/35 px-3 text-xs font-semibold text-hub-primary disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hub-primary"><RefreshCw size={13} /> {isGenerating ? "Refreshing…" : "Refresh code"}</button>
            </div>
          )}
        </section>

        {!isExpired && (
          <>
            <p className="mt-4 flex items-center gap-3 px-1 text-xs leading-relaxed text-hub-muted"><Phone size={20} className="shrink-0 text-hub-primary" /> Hold your phone up to the scanner on the Swap Hub.</p>
            <div aria-live="polite" className="mt-4 flex min-h-11 items-center justify-center gap-2 rounded-full bg-hub-mint px-4 text-xs font-medium text-hub-primary">
              {isVerifying ? <Check size={16} /> : <RefreshCw size={15} className="animate-spin" />}
              {isVerifying ? "Prototype scan only — awaiting the real Hub" : "Waiting for the Hub to scan…"}
            </div>
            <div className="my-4 flex items-center gap-3 text-[10px] font-medium text-hub-muted"><span className="h-px flex-1 bg-hub-line" /> OR <span className="h-px flex-1 bg-hub-line" /></div>
            <button type="button" onClick={simulateScan} disabled={isVerifying} className="flex min-h-[60px] w-full items-center justify-center gap-3 rounded-2xl bg-hub-mint px-4 text-sm font-semibold text-hub-primary transition hover:bg-hub-mint-strong disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hub-primary">
              <ScanLine size={21} />               <span>Simulate Hub scan <span className="block text-[10px] font-normal text-hub-muted">(prototype only; no deposit is verified)</span></span>
            </button>
          </>
        )}
        {showError && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-xs text-danger">{showError}</p>}

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
