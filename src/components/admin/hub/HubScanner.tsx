"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser";

export default function HubScanner() {
  const video = useRef<HTMLVideoElement>(null);
  const controls = useRef<IScannerControls | null>(null);
  const busy = useRef(false);
  const mounted = useRef(true);
  const pollTimer = useRef<number | null>(null);
  const [message, setMessage] = useState("Mulai kamera, lalu arahkan QR donasi ke webcam.");
  const [running, setRunning] = useState(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controls.current?.stop();
      if (pollTimer.current !== null) window.clearTimeout(pollTimer.current);
    };
  }, []);

  async function checkStatus(sessionId: string, attempts: number) {
    try {
      const response = await fetch(`/api/admin/hub-scanner/${encodeURIComponent(sessionId)}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok || result.success !== true) throw new Error("Status perangkat tidak dapat diperiksa.");
      if (!mounted.current) return;
      if (result.data?.status === "RELAY_ACTIVATED") {
        setMessage("ESP32 melaporkan relay aktif. Posisi pintu tidak dapat dipastikan tanpa sensor.");
        busy.current = false;
      } else if (result.data?.status === "EXPIRED") {
        setMessage("Perintah kedaluwarsa sebelum diambil ESP32. Periksa perangkat dan buat QR baru.");
        busy.current = false;
      } else if (attempts >= 27) {
        setMessage("Hasil perangkat belum pasti. Periksa relay secara langsung; jangan mengulang QR ini.");
        busy.current = false;
      } else {
        pollTimer.current = window.setTimeout(() => void checkStatus(sessionId, attempts + 1), 1500);
      }
    } catch {
      if (mounted.current) {
        setMessage("Status perangkat tidak dapat diperiksa. Periksa relay secara langsung; jangan mengulang QR ini.");
        busy.current = false;
      }
    }
  }

  async function submitToken(token: string) {
    try {
      const response = await fetch("/api/admin/hub-scanner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const result = await response.json();
      if (!response.ok || result.success !== true || result.action !== "UNLOCK" ||
          typeof result.data?.sessionId !== "string") {
        if (mounted.current) {
          setMessage(result.message || "QR ditolak atau tidak dapat diverifikasi. Gunakan QR baru.");
          busy.current = false;
        }
        return;
      }
      if (mounted.current) {
        setMessage("QR terverifikasi. Menunggu ESP32 menjalankan perintah...");
        void checkStatus(result.data.sessionId, 0);
      }
    } catch {
      if (mounted.current) {
        setMessage("Koneksi terputus; hasil scan belum pasti. Periksa perangkat dan jangan mengulang QR ini.");
        busy.current = false;
      }
    }
  }

  async function startScanner() {
    if (busy.current || !video.current) return;
    busy.current = true;
    setMessage("Memulai webcam...");
    try {
      const reader = new BrowserQRCodeReader();
      let submitted = false;
      let failed = false;
      controls.current = await reader.decodeFromVideoDevice(undefined, video.current, (result, error, scanner) => {
        if (!busy.current || submitted || failed || !mounted.current) return;
        if (!result) {
          if (error) {
            const kind = typeof error.getKind === "function" ? error.getKind() : "";
            if (!["NotFoundException", "ChecksumException", "FormatException"].includes(kind)) {
              failed = true;
              busy.current = false;
              controls.current = null;
              setRunning(false);
              setMessage("Pemindaian kamera berhenti karena kesalahan. Mulai ulang kamera.");
            }
          }
          return;
        }
        const token = result.getText();
        if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
          setMessage("QR bukan token donasi SwapIt. Arahkan QR donasi yang benar.");
          return;
        }
        submitted = true;
        scanner.stop();
        controls.current = null;
        setRunning(false);
        setMessage("Memverifikasi QR...");
        void submitToken(token);
      });
      if (!mounted.current) {
        controls.current?.stop();
        controls.current = null;
        return;
      }
      if (submitted || failed) {
        controls.current?.stop();
        controls.current = null;
        return;
      }
      setRunning(true);
      setMessage("Arahkan QR donasi ke webcam.");
    } catch {
      if (mounted.current) {
        setMessage("Webcam tidak dapat digunakan. Periksa izin kamera dan gunakan HTTPS atau localhost.");
        busy.current = false;
        setRunning(false);
      }
    }
  }

  function stopScanner() {
    controls.current?.stop();
    controls.current = null;
    busy.current = false;
    setRunning(false);
    setMessage("Kamera dihentikan.");
  }

  return (
    <div className="mx-auto max-w-xl rounded-2xl bg-white p-5 shadow-card">
      <h1 className="text-xl font-semibold text-ink">Scanner QR donasi</h1>
      <p className="mt-2 text-sm text-ink-muted">Scanner ini memerlukan ADMIN dan ESP32 yang terdaftar untuk Hub yang benar.</p>
      <video ref={video} className="mt-4 w-full rounded-xl bg-black" muted playsInline />
      <p className="mt-4 text-sm" role="status" aria-live="polite">{message}</p>
      <button type="button" onClick={running ? stopScanner : () => void startScanner()} className="mt-4 rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-white">
        {running ? "Hentikan kamera" : "Mulai kamera"}
      </button>
      <p className="mt-3 text-xs text-ink-muted">Relay aktif bukan bukti pintu terbuka. Jangan gunakan simulasi untuk menyelesaikan donasi fisik.</p>
    </div>
  );
}
