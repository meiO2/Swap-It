"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";
import { calculateDonationReward, GREEN_POINT_REWARDS } from "@/lib/green-point-rewards";

type Donor = { _id: string; name: string; email: string; phone?: string };
type ItemCounts = [string, string, string, string];

type Donation = {
  _id: string;
  hubId: string;
  totalItems: number;
  donorReportedItems: number;
  acceptedItems: number;
  rejectedItems: number;
  resaleQualityItems: number;
  upcyclingQualityItems: number;
  socialDonationItems: number;
  gpAwarded: number;
  status: string;
  userId: Donor | string | null;
  createdAt: string;
  confirmedAt?: string;
  verifiedAt?: string;
  verifiedBy?: string;
  classificationHistory?: {
    classifiedBy: string;
    classifiedAt: string;
    resaleQualityItems: number;
    upcyclingQualityItems: number;
    socialDonationItems: number;
    rejectedItems: number;
    gpAwarded: number;
  }[];
};

export default function AdminDonationsPage() {
  const [donations, setDonations] = useState<Donation[]>([]);
  const [counts, setCounts] = useState<Record<string, ItemCounts>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      setDonations(await apiRequest<Donation[]>("/api/donations"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load donations.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function review(donation: Donation) {
    const values = counts[donation._id] ?? ["0", "0", "0", "0"];
    const [resale, upcycling, social, rejected] = values.map(Number);
    const total = resale + upcycling + social + rejected;
    if (![resale, upcycling, social, rejected].every((value) => Number.isSafeInteger(value) && value >= 0) || total < 1 || total > 30) {
      setError("Classified quantities must be whole numbers totaling between 1 and 30 items.");
      return;
    }
    setError("");
    setNotice("");
    setSubmitting(donation._id);
    try {
      await apiRequest(`/api/donations/${donation._id}`, {
        method: "PATCH",
        body: JSON.stringify({
          resaleQualityItems: resale,
          upcyclingQualityItems: upcycling,
          socialDonationItems: social,
          rejectedItems: rejected,
        }),
      });
      const awarded = calculateDonationReward({
        resaleQualityItems: resale,
        upcyclingQualityItems: upcycling,
        socialDonationItems: social,
        rejectedItems: rejected,
      });
      setNotice(awarded > 0
        ? `Donation finalized. ${awarded.toLocaleString("id-ID")} GP was awarded.`
        : "Donation finalized. All items were rejected; no GP was awarded.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not review donation.");
    } finally {
      setSubmitting("");
    }
  }

  const waiting = donations.filter((donation) => ["UNDER_VERIFICATION", "PENDING"].includes(donation.status));
  const completed = donations.filter((donation) => ["COMPLETED", "REWARD_GRANTED"].includes(donation.status));
  const incomplete = donations.filter((donation) => ["SESSION_CREATED", "QR_SCANNED", "DEPOSITING", "DISCREPANCY_REVIEW", "CANCELLED"].includes(donation.status));

  function donorLabel(donation: Donation) {
    return donation.userId && typeof donation.userId === "object"
      ? `${donation.userId.name} · ${donation.userId.email}${donation.userId.phone ? ` · ${donation.userId.phone}` : ""}`
      : donation.userId ? `Donor ID ${donation.userId}` : "Donor account unavailable";
  }

  function renderClassificationCard(donation: Donation) {
    const values = counts[donation._id] ?? [
      String(donation.resaleQualityItems || 0),
      String(donation.upcyclingQualityItems || 0),
      String(donation.socialDonationItems || 0),
      String(donation.rejectedItems || 0),
    ];
    const nums = values.map((value) => Number(value));
    const total = nums.reduce((sum, value) => sum + value, 0);
    const quantitiesValid = nums.every((value) => Number.isSafeInteger(value) && value >= 0 && value <= 30);
    const validTotal = quantitiesValid && total >= 1 && total <= 30;
    const gp = calculateDonationReward({
      resaleQualityItems: nums[0],
      upcyclingQualityItems: nums[1],
      socialDonationItems: nums[2],
      rejectedItems: nums[3],
    });
    const labels = [
      `Resale · ${GREEN_POINT_REWARDS.donationResaleQualityPerItem.toLocaleString("id-ID")} GP/item`,
      `Upcycling / Revamp · ${GREEN_POINT_REWARDS.donationUpcyclingQualityPerItem.toLocaleString("id-ID")} GP/item`,
      `Social donation · ${GREEN_POINT_REWARDS.donationSocialPerItem.toLocaleString("id-ID")} GP/item`,
      "Rejected · 0 GP",
    ];

    return (
      <article key={donation._id} className="rounded-2xl bg-white p-5 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-xs text-ink-muted">Hub {donation.hubId} · {new Date(donation.createdAt).toLocaleString("id-ID")}</p>
            <h2 className="mt-1 text-base font-semibold text-ink">Donation session {donation._id}</h2>
            <p className="mt-1 text-xs text-ink-muted">Donor: {donorLabel(donation)}</p>
            <p className="mt-1 text-xs text-ink-muted">Status: {donation.status === "PENDING" ? "Pending (eligible for review)" : "Hub deposit confirmed — awaiting review"}</p>
            <p className="mt-1 text-xs text-ink-muted">Donor-reported items: {donation.donorReportedItems || "Not provided"} · Deposit confirmed: {donation.confirmedAt ? new Date(donation.confirmedAt).toLocaleString("id-ID") : "Legacy record"}</p>
          </div>
          <span className="rounded-full bg-hub-mint px-3 py-1 text-xs font-semibold text-hub-primary">{donation.status}</span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {labels.map((label, index) => (
            <label key={label} className="text-xs font-semibold text-ink">
              {label}
              <input
                type="number"
                min={0}
                max={30}
                step={1}
                value={values[index]}
                onChange={(event) => setCounts((current) => ({
                  ...current,
                  [donation._id]: values.map((value, itemIndex) => itemIndex === index ? event.target.value : value) as ItemCounts,
                }))}
                className="mt-1 h-10 w-full rounded-xl border border-border px-3 text-sm outline-none focus:border-primary"
              />
            </label>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-hub-mint/50 p-3 text-sm">
          <span>Classified total: <strong>{total}</strong> / 30 items</span>
          <span>Final GP: <strong>{validTotal ? gp.toLocaleString("id-ID") : "—"}</strong></span>
        </div>
        <button
          type="button"
          onClick={() => void review(donation)}
          disabled={submitting === donation._id || Boolean(submitting) || !validTotal}
          className="mt-4 min-h-11 rounded-full bg-primary px-5 text-xs font-semibold text-white disabled:opacity-50"
        >
          {submitting === donation._id ? "Finalizing…" : "Confirm classification & finalize"}
        </button>
      </article>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">Admin / Green Point</p>
        <h1 className="mt-1 text-2xl font-bold text-ink">Donation verification</h1>
        <p className="mt-2 text-sm text-ink-muted">Assign each donated item to a quality category before issuing GP.</p>
      </header>
      {error && <p role="alert" className="mb-3 rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p>}
      {notice && <p role="status" className="mb-3 rounded-xl bg-success/10 p-3 text-sm text-success">{notice}</p>}
      <button type="button" onClick={() => void load()} disabled={loading} className="mb-4 min-h-10 rounded-full border border-border px-4 text-xs font-semibold text-ink disabled:opacity-50">Refresh donations</button>

      {loading && <p role="status" className="rounded-xl bg-white p-4 text-sm text-ink-muted">Loading donation records…</p>}
      {!loading && !error && (
        <div className="space-y-8">
          <section aria-labelledby="waiting-title" className="space-y-4">
            <h2 id="waiting-title" className="text-lg font-semibold text-ink">Awaiting verification ({waiting.length})</h2>
            {waiting.length ? waiting.map(renderClassificationCard) : <p className="rounded-xl bg-white p-4 text-sm text-ink-muted">No donations are awaiting verification.</p>}
          </section>
          <section aria-labelledby="completed-title" className="space-y-3">
            <h2 id="completed-title" className="text-lg font-semibold text-ink">Completed history ({completed.length})</h2>
            {completed.length ? completed.map((donation) => (
              <article key={donation._id} className="rounded-2xl bg-white p-4 shadow-card">
                <div className="flex flex-wrap justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-ink">Donation session {donation._id}</h3>
                    <p className="mt-1 text-xs text-ink-muted">{donorLabel(donation)} · Hub {donation.hubId}</p>
                    <p className="mt-1 text-xs text-ink-muted">{donation.totalItems} total · {donation.acceptedItems} accepted · {donation.rejectedItems} rejected · {donation.verifiedAt ? new Date(donation.verifiedAt).toLocaleString("id-ID") : "Legacy completion"}</p>
                    <p className="mt-1 text-xs text-ink-muted">Resale {donation.resaleQualityItems} · Upcycling {donation.upcyclingQualityItems} · Social {donation.socialDonationItems}</p>
                    {donation.classificationHistory?.map((classification, index) => (
                      <p key={`${classification.classifiedAt}-${index}`} className="mt-1 text-[10px] text-ink-muted">
                        Classification #{index + 1}: {classification.resaleQualityItems} resale, {classification.upcyclingQualityItems} upcycling, {classification.socialDonationItems} social, {classification.rejectedItems} rejected · {new Date(classification.classifiedAt).toLocaleString("id-ID")}
                      </p>
                    ))}
                  </div>
                  <strong className="text-sm text-primary">{(donation.gpAwarded ?? 0).toLocaleString("id-ID")} GP</strong>
                </div>
              </article>
            )) : <p className="rounded-xl bg-white p-4 text-sm text-ink-muted">No completed donations yet.</p>}
          </section>
          <section aria-labelledby="incomplete-title" className="space-y-3">
            <h2 id="incomplete-title" className="text-lg font-semibold text-ink">Incomplete / failed sessions ({incomplete.length})</h2>
            {incomplete.length ? incomplete.map((donation) => (
              <article key={donation._id} className="rounded-2xl bg-white p-4 shadow-card">
                <h3 className="text-sm font-semibold text-ink">{donation.status} · Hub {donation.hubId}</h3>
                <p className="mt-1 text-xs text-ink-muted">{donorLabel(donation)} · {new Date(donation.createdAt).toLocaleString("id-ID")}</p>
                <p className="mt-1 text-xs text-ink-muted">Session {donation._id}</p>
              </article>
            )) : <p className="rounded-xl bg-white p-4 text-sm text-ink-muted">No incomplete sessions.</p>}
          </section>
        </div>
      )}
    </div>
  );
}
