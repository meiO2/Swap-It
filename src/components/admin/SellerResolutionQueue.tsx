"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";

type Job = {
  _id: string;
  orderId: string;
  status: string;
  failedAttempts?: number;
  lastFailureAt?: string;
  nextAttemptAt?: string;
  createdAt: string;
};

type Queue = {
  items: Job[];
  pagination: { page: number; totalPages: number; total: number };
};

export default function SellerResolutionQueue() {
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [queue, setQueue] = useState<Queue | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({ page: String(page), pageSize: "10" });
    if (status) params.set("status", status);
    if (query) params.set("search", query);
    apiRequest<Queue>(`/api/admin/seller-financial-resolutions?${params}`)
      .then((result) => {
        if (active) { setQueue(result); setError(""); }
      })
      .catch((cause: unknown) => {
        if (active) {
          setQueue(null);
          setError(cause instanceof Error ? cause.message : "Could not load the seller resolution queue.");
        }
      });
    return () => { active = false; };
  }, [page, query, status]);

  return (
    <section className="space-y-3 rounded-2xl bg-white p-4 shadow-card">
      <h2 className="font-semibold text-ink">Seller resolution queue</h2>
      <p className="text-xs text-ink-muted">Held and failed jobs require review; they are not retried automatically.</p>
      <form className="flex flex-wrap gap-2" onSubmit={(event) => {
        event.preventDefault();
        setPage(1);
        setQuery(search.trim());
      }}>
        <label className="text-xs text-ink">
          Status
          <select value={status} onChange={(event) => { setPage(1); setStatus(event.target.value); }} className="ml-2 min-h-9 rounded-lg border border-border px-2">
            <option value="">All</option>
            <option value="PENDING">Pending</option>
            <option value="ON_HOLD">On hold</option>
            <option value="FAILED_REQUIRES_ATTENTION">Failed</option>
            <option value="READY_FOR_REVIEW">Ready for review</option>
            <option value="RESOLVED">Resolved</option>
          </select>
        </label>
        <label className="text-xs text-ink">
          Order or resolution ID
          <input value={search} onChange={(event) => setSearch(event.target.value)} maxLength={24} className="ml-2 min-h-9 rounded-lg border border-border px-2" />
        </label>
        <button type="submit" className="min-h-9 rounded-lg border border-border px-3 text-xs">Search</button>
      </form>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {!queue && !error && <p role="status" className="text-sm text-ink-muted">Loading resolution jobs…</p>}
      {queue && (
        <>
          {queue.items.map((job) => (
            <article key={job._id} className="border-t border-border pt-3 text-xs text-ink-muted">
              <p className="font-semibold text-ink">{job.status} · Order {job.orderId}</p>
              <p>Job {job._id} · Failed attempts {job.failedAttempts ?? "not recorded"}</p>
              <p>
                Created {new Date(job.createdAt).toLocaleString("id-ID")}
                {job.lastFailureAt && <> · Last failure {new Date(job.lastFailureAt).toLocaleString("id-ID")}</>}
                {job.nextAttemptAt && <> · Next retry {new Date(job.nextAttemptAt).toLocaleString("id-ID")}</>}
              </p>
            </article>
          ))}
          {queue.items.length === 0 && <p className="text-sm text-ink-muted">No resolution jobs match these filters.</p>}
          <nav aria-label="Resolution queue pagination" className="flex items-center gap-3 text-xs">
            <button type="button" disabled={queue.pagination.page <= 1} onClick={() => setPage(queue.pagination.page - 1)} className="rounded border border-border px-3 py-2 disabled:opacity-50">Previous</button>
            <span>Page {queue.pagination.page} of {Math.max(queue.pagination.totalPages, 1)} · {queue.pagination.total} jobs</span>
            <button type="button" disabled={queue.pagination.page >= queue.pagination.totalPages} onClick={() => setPage(queue.pagination.page + 1)} className="rounded border border-border px-3 py-2 disabled:opacity-50">Next</button>
          </nav>
        </>
      )}
    </section>
  );
}
