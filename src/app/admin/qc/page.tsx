"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";
import { qcCriteriaByCategory } from "@/data/qcCriteria";

type QueueItem = {
  id: string;
  type: "order" | "listing";
  createdAt: string;
  category: string;
  title: string;
  quantity?: number;
  value: number;
  size?: string;
  condition?: string;
  description?: string;
  image?: string;
  delivery?: { method?: string; hub?: { name?: string } };
  fulfillment?: string;
};

export default function AdminQcPage() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [selected, setSelected] = useState<Record<string, Record<string, string>>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setItems(await apiRequest<QueueItem[]>("/api/admin/qc"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load the QC queue.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    apiRequest<QueueItem[]>("/api/admin/qc")
      .then((data) => { if (active) setItems(data); })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Could not load the QC queue."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function submitReview(item: QueueItem, decision: "approve" | "reject") {
    const criteria = qcCriteriaByCategory[item.category] ?? qcCriteriaByCategory.default;
    const answers = Object.entries(selected[item.id] ?? {}).map(([criterionId, optionId]) => ({ criterionId, optionId }));
    setSavingId(item.id);
    setError("");
    setNotice("");
    try {
      await apiRequest(`/api/admin/qc/${item.type}/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ category: item.category, answers, decision }),
      });
      setNotice(`${item.title} QC assessment saved.`);
      await loadQueue();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save this QC assessment.");
    } finally {
      setSavingId("");
    }
    if (!criteria.length) setError(`No approved criteria exist for ${item.category}; this review cannot be submitted yet.`);
  }

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-5"><p className="text-xs font-semibold uppercase tracking-wide text-primary">Admin / QC</p><h1 className="mt-1 text-2xl font-bold text-ink">Product quality checks</h1><p className="mt-2 text-sm text-ink-muted">Review item details and select one specified option for each criterion.</p></header>
      <p className="mb-4 rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-ink"><strong>Specification needed:</strong> QC criteria and option labels are TODO(spec). No placeholder review can be submitted until the approved product specification is supplied.</p>
      {error && <p role="alert" className="mb-3 rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p>}
      {notice && <p role="status" className="mb-3 rounded-xl bg-success/10 p-3 text-sm text-success">{notice}</p>}
      {loading ? <p role="status" className="rounded-2xl bg-white p-5 text-sm text-ink-muted">Loading review queue…</p> : items.length ? (
        <div className="space-y-4">
          {items.map((item) => {
            const criteria = qcCriteriaByCategory[item.category] ?? qcCriteriaByCategory.default;
            const picks = selected[item.id] ?? {};
            const complete = criteria.length > 0 && criteria.every((criterion) => picks[criterion.id]);
            return (
              <article key={`${item.type}:${item.id}`} className="rounded-2xl bg-white p-5 shadow-card">
                <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-medium uppercase tracking-wide text-primary">{item.type} · {item.category}</p><h2 className="mt-1 text-lg font-semibold text-ink">{item.title}</h2></div><p className="text-sm font-semibold text-ink">Rp{item.value.toLocaleString("id-ID")}</p></div>
                <dl className="mt-4 grid gap-2 rounded-xl bg-mint-50 p-3 text-sm sm:grid-cols-2">
                  {item.quantity !== undefined && <div><dt className="text-xs text-ink-muted">Quantity</dt><dd className="font-medium">{item.quantity}</dd></div>}
                  {item.size && <div><dt className="text-xs text-ink-muted">Size</dt><dd className="font-medium">{item.size}</dd></div>}
                  {item.condition && <div><dt className="text-xs text-ink-muted">Condition</dt><dd className="font-medium">{item.condition}</dd></div>}
                  {item.fulfillment && <div><dt className="text-xs text-ink-muted">Handover</dt><dd className="font-medium">{item.fulfillment}</dd></div>}
                  {item.delivery?.method && <div><dt className="text-xs text-ink-muted">Delivery</dt><dd className="font-medium">{item.delivery.method === "pickup" ? `Pickup at ${item.delivery.hub?.name ?? "Swap Hub"}` : "Courier delivery"}</dd></div>}
                  {item.description && <div className="sm:col-span-2"><dt className="text-xs text-ink-muted">Description</dt><dd className="font-medium">{item.description}</dd></div>}
                </dl>
                {item.image && <a className="mt-3 inline-block text-xs font-semibold text-primary underline" href={item.image} target="_blank" rel="noreferrer">Open product image</a>}
                <div className="mt-4 space-y-3">
                  {criteria.map((criterion) => <fieldset key={criterion.id}><legend className="mb-2 text-sm font-semibold text-ink">{criterion.label}</legend><div className="flex flex-wrap gap-2">{criterion.options.map((option) => <button key={option.id} type="button" aria-pressed={picks[criterion.id] === option.id} onClick={() => setSelected((value) => ({ ...value, [item.id]: { ...value[item.id], [criterion.id]: option.id } }))} className={`min-h-10 rounded-full border px-4 text-xs font-semibold ${picks[criterion.id] === option.id ? "border-primary bg-primary text-white" : "border-border bg-white text-ink"}`}>{option.label}</button>)}</div></fieldset>)}
                  {!criteria.length && <p className="text-xs text-ink-muted">No criteria or options configured for “{item.category}”.</p>}
                </div>
                <div className="mt-5 grid gap-2 sm:grid-cols-2">
                  <button type="button" disabled={!complete || savingId === item.id} onClick={() => void submitReview(item, "approve")} className="min-h-11 rounded-full bg-primary text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{savingId === item.id ? "Saving…" : "Approve"}</button>
                  <button type="button" disabled={!complete || savingId === item.id} onClick={() => void submitReview(item, "reject")} className="min-h-11 rounded-full border border-danger/40 text-sm font-semibold text-danger disabled:cursor-not-allowed disabled:opacity-50">Reject</button>
                </div>
              </article>
            );
          })}
        </div>
      ) : <section className="rounded-2xl bg-white p-6 text-center shadow-card"><h2 className="font-semibold text-ink">No items awaiting review</h2><p className="mt-1 text-sm text-ink-muted">Items will appear here after order/listing records are saved.</p></section>}
    </div>
  );
}
