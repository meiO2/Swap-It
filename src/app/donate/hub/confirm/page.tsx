"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Info, MapPin, Shirt } from "lucide-react";
import { HubStepGuard, StickyActions, SummaryRow, hubPrimaryButton, hubSecondaryButton, useSwapHubs } from "@/components/hub/hub-ui";
import { useHubSession } from "@/store/hubSession";

function ConfirmContent() {
  const router = useRouter();
  const hubId = useHubSession((state) => state.hubId);
  const itemCount = useHubSession((state) => state.itemCount);
  const confirm = useHubSession((state) => state.confirm);
  const [error, setError] = useState("");
  const { hubs, loading } = useSwapHubs();
  const hub = hubs.find((item) => item.id === hubId) ?? hubs[0];

  if (loading) return <p className="p-6 text-sm text-hub-muted">Loading Swap Hubs…</p>;
  if (!hub) return <p className="p-6 text-sm text-hub-muted">No Swap Hub is configured yet.</p>;

  function confirmDonation() {
    try {
      confirm();
      router.push("/donate/hub/done");
    } catch (reason) {
      console.error("Could not confirm the donation.", reason);
      setError(reason instanceof Error ? reason.message : "The donation could not be confirmed.");
    }
  }

  return (
    <HubStepGuard step="confirm">
      <main className="flex flex-1 flex-col pt-5">
        <header className="mb-4">
          <h1 className="text-xl font-bold">Review &amp; confirm</h1>
          <p className="mt-1 text-xs text-hub-muted">Check your details before confirming.</p>
        </header>

        <section className="rounded-3xl bg-white px-4 shadow-card">
          <SummaryRow icon={<MapPin size={19} />} label="Hub location" value={hub.name} detail={hub.address} />
          <SummaryRow icon={<Shirt size={19} />} label="Reported item count" value={`${itemCount} ${itemCount === 1 ? "piece" : "pieces"}`} last />
        </section>

        <p className="mt-4 flex items-start gap-2 rounded-2xl bg-hub-mint p-3 text-xs leading-relaxed text-hub-muted"><Info size={17} className="mt-0.5 shrink-0 text-hub-primary" /> This count is informational only. The Hub confirms the physical deposit; Green Points are awarded after an administrator classifies the items.</p>
        {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-xs text-danger">{error}</p>}

        <StickyActions>
          <button type="button" onClick={() => router.push("/donate/hub/insert")} className={hubSecondaryButton}>Edit quantity</button>
          <button type="button" onClick={confirmDonation} className={hubPrimaryButton}>Confirm &amp; finish</button>
        </StickyActions>
      </main>
    </HubStepGuard>
  );
}

export default function DonationConfirmPage() {
  return <ConfirmContent />;
}
