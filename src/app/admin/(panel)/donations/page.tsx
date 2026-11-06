"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";

type Donation = {
  _id: string;
  hubId: string;
  totalItems: number;
  status: "PENDING" | "COMPLETED" | "CANCELLED";
  createdAt: string;
};

export default function AdminDonationsPage() {
  const [donations, setDonations] = useState<Donation[]>([]);
  const [counts, setCounts] = useState<Record<string, [string, string, string, string]>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    try {
      setDonations(await apiRequest<Donation[]>("/api/donations"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load donations.");
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function review(donation: Donation) {
    const values = counts[donation._id] ?? ["0", "0", "0", "0"];
    const [resale, upcycling, social, rejected] = values.map(Number);
    if (![resale, upcycling, social, rejected].every((value) => Number.isSafeInteger(value) && value >= 0) || resale + upcycling + social + rejected < 1) {
      setError("Enter valid non-negative item counts.");
      return;
    }
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
      setNotice("Donation reviewed and GP reward issued.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not review donation.");
    }
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
      <div className="space-y-4">
        {donations.filter((donation) => donation.status === "PENDING").map((donation) => {
          const values = counts[donation._id] ?? ["0", "0", "0", "0"];
          return (
            <article key={donation._id} className="rounded-2xl bg-white p-5 shadow-card">
              <p className="text-xs text-ink-muted">Hub {donation.hubId} · {new Date(donation.createdAt).toLocaleString("id-ID")}</p>
              <h2 className="mt-1 text-base font-semibold text-ink">Donation session {donation._id}</h2>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {["Resale · 5,000 GP", "Upcycling · 3,000 GP", "Social · 2,000 GP", "Rejected · 0 GP"].map((label, index) => (
                  <label key={label} className="text-xs font-semibold text-ink">
                    {label}
                    <input type="number" min={0} step={1} value={values[index]} onChange={(event) => setCounts((current) => ({ ...current, [donation._id]: values.map((value, itemIndex) => itemIndex === index ? event.target.value : value) as [string, string, string, string] }))} className="mt-1 h-10 w-full rounded-xl border border-border px-3 text-sm outline-none focus:border-primary" />
                  </label>
                ))}
              </div>
              <button type="button" onClick={() => void review(donation)} className="mt-4 min-h-11 rounded-full bg-primary px-5 text-xs font-semibold text-white">Verify &amp; issue GP</button>
            </article>
          );
        })}
      </div>
    </div>
  );
}
