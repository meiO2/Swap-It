"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, CalendarClock, CircleHelp, Plus } from "lucide-react";
import StatusBadge from "@/components/ui/StatusBadge";
import Timeline from "@/components/ui/Timeline";
import { formatRupiah, formatShortDate } from "@/lib/format";
import { useSwapStore, type Listing } from "@/store/useSwapStore";

export default function ListingsPage() {
  const listings = useSwapStore((state) => state.listings);
  const updateListingStatus = useSwapStore((state) => state.updateListingStatus);
  const changePickupDate = useSwapStore((state) => state.changePickupDate);
  return (
    <main className="px-4 pb-6 pt-5">
      <header className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3"><Link href="/profile" aria-label="Back to profile" className="rounded-full p-2 text-ink-muted hover:bg-mint-50"><ArrowLeft size={20} /></Link><div><h1 className="text-xl font-semibold text-ink">My listings</h1><p className="text-xs text-ink-muted">Your pieces, from QC to their next home</p></div></div>
        <Link href="/sell" aria-label="Create listing" className="flex size-10 items-center justify-center rounded-full bg-mint-200 text-primary"><Plus size={20} /></Link>
      </header>
      {!listings.length ? (
        <section className="rounded-2xl bg-mint-50 p-5 text-center"><p className="text-sm text-ink-muted">You have no submitted listings yet.</p><Link href="/sell" className="mt-3 inline-block text-xs font-semibold text-primary">Create your first listing</Link></section>
      ) : (
        <div className="space-y-3">
          {listings.map((listing) => (
            <ListingCard key={listing.id} listing={listing} onStatusChange={updateListingStatus} onPickupChange={changePickupDate} />
          ))}
        </div>
      )}
      <section className="mt-4 rounded-2xl bg-mint-50 p-4">
        <h2 className="text-sm font-semibold text-ink">QC timeline</h2>
        <p className="mt-1 text-xs leading-relaxed text-ink-muted">Submitted pieces enter Sorting for manual quality checks at end of day. Passed pieces are listed or shipped to the buyer.</p>
        <Link href="/qc-report/order-qc-demo" className="mt-3 inline-block text-xs font-semibold text-primary">View sample QC report →</Link>
      </section>
    </main>
  );
}

function ListingCard({ listing, onStatusChange, onPickupChange }: {
  listing: Listing;
  onStatusChange: (id: string, status: Listing["status"]) => void;
  onPickupChange: (id: string, date: string) => void;
}) {
  const [scheduleError, setScheduleError] = useState("");
  const nextStatus: Partial<Record<Listing["status"], Listing["status"]>> = {
    Submitted: "Sorting",
    Sorting: "Passed",
    Passed: "Unsold",
  };
  const next = nextStatus[listing.status];
  return (
    <article className="rounded-2xl bg-white p-4 shadow-card">
      <div className="flex items-start justify-between gap-2"><div><h2 className="text-sm font-semibold text-ink">{listing.title}</h2><p className="mt-1 text-xs text-ink-muted">{listing.category} · Size {listing.size} · {listing.condition}</p></div><StatusBadge status={listing.status} /></div>
      <p className="mt-2 text-sm font-semibold text-primary">{formatRupiah(listing.price)}</p>
      <Timeline status={listing.status} />
      <div className="mt-3 rounded-xl bg-mint-50 p-3 text-xs">
        <p className="font-medium text-ink">{listing.fulfillment}</p>
        {listing.fulfillment === "Pickup" && listing.pickupDate && <p className="mt-1 text-ink-muted">Scheduled {formatShortDate(listing.pickupDate)}</p>}
        {listing.fulfillment === "Pickup" && listing.pickupDate && listing.pickupChanges === 0 && (
          <label className="mt-2 block text-[10px] text-ink-muted">Change schedule once (at least H-1)
            <input type="date" aria-label={`Change pickup date for ${listing.title}`} onChange={(event) => {
              if (!event.target.value) return;
              try {
                onPickupChange(listing.id, event.target.value);
                setScheduleError("");
              } catch (reason) {
                setScheduleError(reason instanceof Error ? reason.message : "The pickup date could not be changed.");
              }
            }} className="form-input mt-1" />
          </label>
        )}
        {scheduleError && <p role="alert" className="mt-2 text-[10px] text-danger">{scheduleError}</p>}
        {listing.pickupChanges > 0 && <p className="mt-1 flex items-center gap-1 text-[10px] text-ink-muted"><CalendarClock size={12} /> One schedule change used</p>}
      </div>
      {next && <button type="button" onClick={() => onStatusChange(listing.id, next)} className="mt-3 w-full rounded-full border border-primary/30 py-2 text-xs font-semibold text-primary hover:bg-mint-50">Demo: move to {next}</button>}
      {listing.status === "Sorting" && <button type="button" onClick={() => onStatusChange(listing.id, "Not Eligible")} className="mt-2 w-full rounded-full border border-danger/30 py-2 text-xs font-semibold text-danger hover:bg-danger/10">Demo QC result: Not Eligible</button>}
      {listing.fulfillment === "Swap Hub drop-off" && <Link href="/donate" className="mt-3 block text-center text-[10px] font-semibold text-primary">Open your QR for drop-off →</Link>}
      {listing.status === "Unsold" && <div className="mt-3 flex gap-2 rounded-xl bg-warning/10 p-3 text-[10px] text-warning"><CircleHelp size={14} className="shrink-0" />After 3 months unsold, SwapIt offers 80% of your listing price as GP buyout.</div>}
    </article>
  );
}
