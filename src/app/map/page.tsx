"use client";

import Link from "next/link";
import { ArrowLeft, LocateFixed, MapPin } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import MapView from "@/components/MapView";
import type { SwapHub } from "@/lib/hubs";
import { useEffect } from "react";
import { apiRequest } from "@/lib/api";
import { useHubSession } from "@/store/hubSession";

export default function MapPage() {
  const router = useRouter();
  const setHubId = useHubSession((state) => state.setHubId);
  const [center, setCenter] = useState<[number, number] | null>(null);
  const [selectedHub, setSelectedHub] = useState("");
  const [swapHubs, setSwapHubs] = useState<SwapHub[]>([]);
  const [loadingHubs, setLoadingHubs] = useState(true);
  const [hubError, setHubError] = useState("");
  const [locationError, setLocationError] = useState("");
  const [locating, setLocating] = useState(false);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const hub = swapHubs.find((item) => item.id === selectedHub) ?? swapHubs[0];

  useEffect(() => {
    apiRequest<SwapHub[]>("/api/hubs")
      .then((hubs) => {
        setSwapHubs(hubs);
        if (hubs[0]) {
          setSelectedHub(hubs[0].id);
          setCenter(hubs[0].position);
        }
      })
      .catch((cause: unknown) => {
        setHubError(
          cause instanceof Error ? cause.message : "Could not load Swap Hubs.",
        );
      })
      .finally(() => setLoadingHubs(false));
  }, []);

  if (!hub) {
    return (
      <main className="px-4 py-8">
        <Link href="/" className="text-sm font-semibold text-primary">Back home</Link>
        <p role={hubError ? "alert" : "status"} className="mt-8 rounded-2xl bg-mint-50 p-5 text-center text-sm text-ink-muted">
          {hubError || (loadingHubs ? "Loading Swap Hubs..." : "No swap hubs are available yet.")}
        </p>
      </main>
    );
  }

  function centerOnMyLocation() {
    setLocationError("");
    if (!navigator.geolocation) {
      setLocationError("Location access is not supported by this browser.");
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation([position.coords.latitude, position.coords.longitude]);
        setCenter([position.coords.latitude, position.coords.longitude]);
        setLocating(false);
      },
      (error) => {
        setLocating(false);
        setLocationError(
          error.code === error.PERMISSION_DENIED
            ? "Allow location access in your browser to center the map on you."
            : error.code === error.TIMEOUT
              ? "Could not get your location in time. Please try again."
              : "Could not get your location. Check your device settings and try again.",
        );
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }

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
                  setLocationError("");
                }
              }}
              className="max-w-[250px] bg-transparent font-medium outline-none"
            >
              {swapHubs.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
        </div>
        <button type="button" aria-label="Center on my location" onClick={centerOnMyLocation} disabled={locating} className="rounded-full p-2 text-primary hover:bg-mint-50 disabled:opacity-50"><LocateFixed size={20} /></button>
      </header>

      {locationError && <p role="alert" className="mb-2 rounded-xl bg-warning/15 p-3 text-xs text-warning">{locationError}</p>}

      <div className="relative h-[55vh] min-h-[340px] max-h-[600px] w-full overflow-hidden rounded-2xl bg-mint-50 shadow-card">
        {center && <MapView hubs={swapHubs} center={center} userLocation={userLocation} />}
      </div>

      <section className="mt-3 rounded-2xl bg-white p-4 shadow-card" aria-live="polite">
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-primary">Selected drop-off point</p>
        <h2 className="mt-1 text-sm font-semibold text-ink">{hub.name}</h2>
        <p className="mt-1 text-xs text-ink-muted">{hub.address}</p>
        <p className="mt-1 text-xs text-ink-muted">{hub.openingHours} · {hub.distance} away</p>
        <button
          type="button"
          onClick={() => {
            setHubId(hub.id);
            router.push("/donate/hub/qr");
          }}
          className="mt-3 flex h-10 w-full items-center justify-center rounded-full bg-primary text-xs font-semibold text-white shadow-primary hover:bg-primary-dark"
        >
          Donate here
        </button>
      </section>
    </main>
  );
}
