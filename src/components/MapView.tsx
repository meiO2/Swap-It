"use client";

import dynamic from "next/dynamic";
import type { SwapHub } from "@/lib/hubs";

const MapCanvas = dynamic(() => import("@/components/MapCanvas"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center bg-mint-50 text-sm text-ink-muted">Loading the neighborhood map…</div>,
});

export default function MapView({
  hubs,
  center,
  userLocation,
}: {
  hubs: SwapHub[];
  center: [number, number];
  userLocation: [number, number] | null;
}) {
  return <MapCanvas hubs={hubs} center={center} userLocation={userLocation} />;
}
