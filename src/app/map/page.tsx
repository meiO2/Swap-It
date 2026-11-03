"use client";

import Link from "next/link";
import { ArrowLeft, LocateFixed, MapPin } from "lucide-react";
import { useState } from "react";
import MapView from "@/components/MapView";
import { swapHubs } from "@/data/mock";

const defaultLocation: [number, number] = swapHubs[0].position;

export default function MapPage() {
  const [center, setCenter] = useState<[number, number]>(defaultLocation);
  const [selectedHub, setSelectedHub] = useState(swapHubs[0].id);
  const hub = swapHubs.find((item) => item.id === selectedHub) ?? swapHubs[0];

  return (
    <main className="flex min-h-[calc(100vh-6rem)] flex-col px-4 pb-5 pt-4">
      <header className="mb-3 flex items-center gap-3">
        <Link href="/" aria-label="Back home" className="rounded-full p-2 text-ink-muted hover:bg-mint-50"><ArrowLeft size={20} /></Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold text-ink">Swap Hubs</h1>
          <label className="mt-1 flex items-center gap-1 text-xs text-primary">
            <MapPin size={13} />
            <select
              aria-label="Select a location"
              value={selectedHub}
              onChange={(event) => {
                const nextHub = swapHubs.find((item) => item.id === event.target.value);
                if (nextHub) {
                  setSelectedHub(nextHub.id);
                  setCenter(nextHub.position);
                }
              }}
              className="max-w-[250px] bg-transparent font-medium outline-none"
            >
              {swapHubs.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
        </div>
        <button type="button" aria-label="Center on my location" onClick={() => { setCenter(defaultLocation); setSelectedHub(swapHubs[0].id); }} className="rounded-full p-2 text-primary hover:bg-mint-50"><LocateFixed size={20} /></button>
      </header>

      <div className="relative min-h-[340px] flex-1 overflow-hidden rounded-2xl bg-mint-50 shadow-card">
        <MapView hubs={swapHubs} center={center} />
      </div>

      <section className="mt-3 rounded-2xl bg-white p-4 shadow-card" aria-live="polite">
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-primary">Selected drop-off point</p>
        <h2 className="mt-1 text-sm font-semibold text-ink">{hub.name}</h2>
        <p className="mt-1 text-xs text-ink-muted">{hub.address}</p>
        <p className="mt-1 text-xs text-ink-muted">{hub.openingHours} · {hub.distance} away</p>
        <Link href="/donate" className="mt-3 flex h-10 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white shadow-primary hover:bg-primary-dark">Donate here</Link>
      </section>
    </main>
  );
}
