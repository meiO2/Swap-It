"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, CalendarClock, Plus } from "lucide-react";
import StatusBadge from "@/components/ui/StatusBadge";
import Timeline from "@/components/ui/Timeline";
import { formatRupiah, formatShortDate } from "@/lib/format";
import { apiRequest } from "@/lib/api";
import type { Listing } from "@/store/useSwapStore";
import type { IUserAddress } from "@/models/User";

type PersistedListing = Listing & { image?: string; description?: string; pickupAddress?: IUserAddress };

export default function ListingsPage() {
  const [listings, setListings] = useState<PersistedListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    apiRequest<PersistedListing[]>("/api/listings")
      .then((data) => { if (active) setListings(data); })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Could not load your listings."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function changePickupDate(id: string, pickupDate: string) {
    setError("");
    const updated = await apiRequest<{ pickupDate: string; pickupChanges: number }>(`/api/listings/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ pickupDate }),
    });
    setListings((current) => current.map((item) => item.id === id ? { ...item, ...updated } : item));
  }

  return (
    <main className="px-4 pb-6 pt-5">
      <header className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3"><Link href="/profile" aria-label="Back to profile" className="rounded-full p-2 text-ink-muted hover:bg-mint-50"><ArrowLeft size={20} /></Link><div><h1 className="text-xl font-semibold text-ink">My listings</h1><p className="text-xs text-ink-muted">Your pieces, from QC to their next home</p></div></div>
        <Link href="/sell" aria-label="Create listing" className="flex size-10 items-center justify-center rounded-full bg-mint-200 text-primary"><Plus size={20} /></Link>
      </header>
      {error && <p role="alert" className="mb-3 rounded-xl bg-danger/10 p-3 text-xs text-danger">{error}</p>}
      {loading ? <p role="status" className="rounded-2xl bg-white p-5 text-sm text-ink-muted">Loading listings…</p> : !listings.length ? (
        <section className="rounded-2xl bg-mint-50 p-5 text-center"><p className="text-sm text-ink-muted">You have no submitted listings yet.</p><Link href="/sell" className="mt-3 inline-block text-xs font-semibold text-primary">Create your first listing</Link></section>
      ) : <div className="space-y-3">{listings.map((listing) => <ListingCard key={listing.id} listing={listing} onPickupChange={changePickupDate} />)}</div>}
      <section className="mt-4 rounded-2xl bg-mint-50 p-4">
        <h2 className="text-sm font-semibold text-ink">QC timeline</h2>
        <p className="mt-1 text-xs leading-relaxed text-ink-muted">Listing QC status is updated by an authorized reviewer. No seller-side demo status controls are available.</p>
      </section>
    </main>
  );
}

function ListingCard({ listing, onPickupChange }: {
  listing: PersistedListing;
  onPickupChange: (id: string, date: string) => Promise<void>;
}) {
  const [scheduleError, setScheduleError] = useState("");
  const [savingDate, setSavingDate] = useState(false);
  return (
    <article className="rounded-2xl bg-white p-4 shadow-card">
      <div className="flex items-start justify-between gap-2"><div><h2 className="text-sm font-semibold text-ink">{listing.title}</h2><p className="mt-1 text-xs text-ink-muted">{listing.category} · Size {listing.size} · {listing.condition}</p></div><StatusBadge status={listing.status} /></div>
      <p className="mt-2 text-sm font-semibold text-primary">{formatRupiah(listing.price)}</p>
      <Timeline status={listing.status} />
      <div className="mt-3 rounded-xl bg-mint-50 p-3 text-xs">
        <p className="font-medium text-ink">{listing.fulfillment}</p>
        {listing.fulfillment === "Pickup" && listing.pickupAddress && <p className="mt-1 text-ink-muted">Pickup from {listing.pickupAddress.name}: {listing.pickupAddress.address}, {listing.pickupAddress.city} {listing.pickupAddress.postalCode}</p>}
        {listing.fulfillment === "Pickup" && listing.pickupDate && <p className="mt-1 text-ink-muted">Scheduled {formatShortDate(listing.pickupDate)}</p>}
        {listing.fulfillment === "Pickup" && listing.pickupDate && listing.pickupChanges === 0 && (
          <label className="mt-2 block text-[10px] text-ink-muted">Change schedule once (at least H-1)
            <input type="date" disabled={savingDate} aria-label={`Change pickup date for ${listing.title}`} onChange={(event) => {
              const date = event.target.value;
              if (!date) return;
              setSavingDate(true);
              void onPickupChange(listing.id, date).then(() => setScheduleError("")).catch((reason: unknown) => setScheduleError(reason instanceof Error ? reason.message : "The pickup date could not be changed.")).finally(() => setSavingDate(false));
            }} className="form-input mt-1" />
          </label>
        )}
        {scheduleError && <p role="alert" className="mt-2 text-[10px] text-danger">{scheduleError}</p>}
        {listing.pickupChanges > 0 && <p className="mt-1 flex items-center gap-1 text-[10px] text-ink-muted"><CalendarClock size={12} /> One schedule change used</p>}
      </div>
    </article>
  );
}
