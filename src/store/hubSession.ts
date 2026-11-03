"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createDonationCode, QR_TTL_SECONDS } from "@/lib/hub";

export type HubSessionStatus = "idle" | "qr_shown" | "scanned" | "confirmed";

type HubSession = {
  status: HubSessionStatus;
  code: string;
  expiresAt: number;
  hubId: string;
  itemCount: number;
  startSession: () => void;
  refreshCode: (ttlSeconds?: number) => void;
  setCodeExpiry: (ttlSeconds: number) => void;
  markScanned: () => void;
  setHubId: (hubId: string) => void;
  setItemCount: (count: number) => void;
  confirm: () => void;
  reset: () => void;
};

const initialSession = {
  status: "idle" as const,
  code: "",
  expiresAt: 0,
  hubId: "hub-bsd",
  itemCount: 1,
};

function createActiveCode(ttlSeconds = QR_TTL_SECONDS) {
  return { code: createDonationCode(), expiresAt: Date.now() + ttlSeconds * 1000 };
}

function validateTtl(ttlSeconds: number) {
  if (!Number.isFinite(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 3600) {
    throw new RangeError("QR code duration must be between 1 and 3600 seconds.");
  }
}

export const useHubSession = create<HubSession>()(
  persist(
    (set, get) => ({
      ...initialSession,
      startSession: () => set({ ...initialSession, status: "qr_shown", ...createActiveCode() }),
      refreshCode: (ttlSeconds = QR_TTL_SECONDS) => {
        validateTtl(ttlSeconds);
        if (get().status === "idle") {
          set({ ...initialSession, status: "qr_shown", ...createActiveCode(ttlSeconds) });
          return;
        }
        set({ status: "qr_shown", ...createActiveCode(ttlSeconds) });
      },
      setCodeExpiry: (ttlSeconds) => {
        validateTtl(ttlSeconds);
        set({ expiresAt: Date.now() + ttlSeconds * 1000 });
      },
      markScanned: () => {
        const session = get();
        if (session.status !== "qr_shown" || session.expiresAt <= Date.now()) {
          throw new RangeError("This donation QR code has expired. Refresh it before continuing.");
        }
        set({ status: "scanned" });
      },
      setHubId: (hubId) => {
        if (!hubId.trim()) throw new RangeError("Choose a valid Swap Hub.");
        set({ hubId });
      },
      setItemCount: (count) => {
        if (!Number.isFinite(count)) throw new RangeError("Donation quantity must be a number.");
        set({ itemCount: Math.max(0, Math.min(30, Math.floor(count))) });
      },
      confirm: () => {
        const { itemCount, status } = get();
        if (status !== "scanned" || itemCount < 1 || itemCount > 30) {
          throw new RangeError("Scan the Hub and enter between 1 and 30 items before confirming.");
        }
        set({ status: "confirmed" });
      },
      reset: () => set(initialSession),
    }),
    {
      name: "swapit-hub-session",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
    },
  ),
);
