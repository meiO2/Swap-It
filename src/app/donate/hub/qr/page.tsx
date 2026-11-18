"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { Check, Clock3, Phone, RefreshCw } from "lucide-react";
import { HubStepGuard, HubLocationCard } from "@/components/hub/hub-ui";
import { useHubSession } from "@/store/hubSession";
import { QR_TTL_SECONDS } from "@/lib/hub";
import { ApiError, apiRequest } from "@/lib/api";

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
  const markHubScanned = useHubSession((state) => state.markHubScanned);
  const [now, setNow] = useState<number | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [actionError, setActionError] = useState("");
  const [connectionError, setConnectionError] = useState("");
  const [scanConfirmed, setScanConfirmed] = useState(false);
  const [verificationFailed, setVerificationFailed] = useState(false);
  const qrRequestInFlight = useRef(false);
  const statusRequestInFlight = useRef(false);
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
    if (!donationId || !code || scanConfirmed || verificationFailed) return;
    let active = true;
    const checkStatus = async () => {
      if (statusRequestInFlight.current) return;
      statusRequestInFlight.current = true;
      try {
        const donation = await apiRequest<DonationRecord>(`/api/donations/${encodeURIComponent(donationId)}`);
        if (!active) return;
        setConnectionError("");
        if (["QR_SCANNED", "DEPOSITING", "UNDER_VERIFICATION", "COMPLETED"].includes(donation.status)) {
          markHubScanned();
          setScanConfirmed(true);
        } else if (donation.status === "CANCELLED") {
          setVerificationFailed(true);
        }
      } catch (reason) {
        if (!active) return;
        if (reason instanceof ApiError && [401, 403, 404].includes(reason.status)) {
          setVerificationFailed(true);
        } else {
          setConnectionError(reason instanceof Error ? reason.message : "Could not check the donation status.");
        }
      } finally {
        statusRequestInFlight.current = false;
      }
    };
    void checkStatus();
    const timerId = window.setInterval(() => void checkStatus(), 2500);
    return () => {
      active = false;
      window.clearInterval(timerId);
    };
  }, [code, donationId, markHubScanned, scanConfirmed, verificationFailed]);

  useEffect(() => {
    if (!scanConfirmed) return;
    const timerId = window.setTimeout(() => router.push("/donate/hub/insert"), 700);
    return () => window.clearTimeout(timerId);
  }, [router, scanConfirmed]);

  const remaining = !expiresAt || now === null ? QR_TTL_SECONDS : Math.max(0, Math.ceil((expiresAt - now) / 1000));
  const isExpired = Boolean(code) && now !== null && remaining === 0;
  const timer = `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`;

  return (
    <HubStepGuard step="qr">
      <main className="flex flex-1 flex-col pt-5">
        <HubLocationCard hubId={hubId} />

        {verificationFailed && (
          <section aria-live="polite" className="mt-4 rounded-2xl border border-danger/15 bg-red-50 p-4">
            <h1 className="text-sm font-bold text-danger">QR verification failed</h1>
            <p className="mt-1 text-xs leading-relaxed text-danger/85">This donation session is no longer valid. Start a new donation session to continue.</p>
          </section>
        )}

        {scanConfirmed && (
          <div aria-live="polite" className="mt-4 flex min-h-11 items-center justify-center gap-2 rounded-full bg-hub-mint px-4 text-xs font-medium text-hub-primary">
            <Check size={16} /> QR successfully scanned by the physical Hub
          </div>
        )}

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
          <p className="mx-auto mt-3 w-fit rounded-full bg-hub-mint px-4 py-2 text-sm font-bold tracking-[0.12em] text-hub-ink">{code ? "Secure Hub QR ready" : "Generating QR code…"}</p>
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
              {scanConfirmed ? <Check size={16} /> : <RefreshCw size={15} className="animate-spin" />}
              {scanConfirmed ? "QR successfully scanned" : "Waiting for physical Hub scanner…"}
            </div>
          </>
        )}
        {showError && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-xs text-danger">{showError}</p>}
        {connectionError && <p role="status" className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">Connection error: {connectionError}. Retrying donation status check…</p>}

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
