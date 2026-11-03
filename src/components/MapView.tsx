"use client";

import dynamic from "next/dynamic";
import type { SwapHub } from "@/data/mock";

const MapCanvas = dynamic(() => import("@/components/MapCanvas"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center bg-mint-50 text-sm text-ink-muted">Loading the neighborhood map…</div>,
});

export default function MapView({ hubs, center }: { hubs: SwapHub[]; center: [number, number] }) {
  return <MapCanvas hubs={hubs} center={center} />;
}
