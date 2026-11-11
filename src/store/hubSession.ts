"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type HubSessionStatus = "idle" | "qr_shown" | "scanned" | "confirmed";

type HubSession = {
  status: HubSessionStatus;
  code: string;
  expiresAt: number;
  sessionKey: string;
  hubId: string;
  donationId: string;
  itemCount: number;
  startSession: (hubId?: string) => void;
  setQrCredential: (code: string, expiresAt: number) => void;
  markScanned: () => void;
  markHubScanned: () => void;
  setHubId: (hubId: string) => void;
  setDonationId: (donationId: string) => void;
  setItemCount: (count: number) => void;
  confirm: () => void;
  reset: () => void;
};

const initialSession = {
  status: "idle" as const,
  code: "",
  expiresAt: 0,
  sessionKey: "",
  hubId: "hub-bsd",
  donationId: "",
  itemCount: 1,
};

export const useHubSession = create<HubSession>()(
  persist(
    (set, get) => ({
      ...initialSession,
      startSession: (hubId) => set({
        ...initialSession,
        hubId: hubId ?? get().hubId,
        sessionKey: crypto.randomUUID(),
        status: "qr_shown",
      }),
      setQrCredential: (code, expiresAt) => {
        if (!code.trim() || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
          throw new RangeError("A valid, unexpired Hub QR credential is required.");
        }
        set({ code, expiresAt });
      },
      markScanned: () => {
        const session = get();
        if (session.status !== "qr_shown" || session.expiresAt <= Date.now()) {
          throw new RangeError("This donation QR code has expired. Refresh it before continuing.");
        }
        set({ status: "scanned" });
      },
      markHubScanned: () => set({ status: "scanned" }),
      setHubId: (hubId) => {
        if (!hubId.trim()) throw new RangeError("Choose a valid Swap Hub.");
        set({ hubId });
      },
      setDonationId: (donationId) => {
        if (!donationId.trim()) throw new RangeError("A valid donation session is required.");
        set({ donationId });
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
