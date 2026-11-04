"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { apiRequest } from "@/lib/api";

type Merchandise = { _id: string; name: string; category: string; size: string; condition: string; description: string; price: number; image: string; status: "draft" | "available" | "archived" };
const initialForm = { name: "", category: "", size: "", condition: "", description: "", price: "", image: "", status: "draft" as Merchandise["status"] };

export default function AdminRevampPage() {
  const [items, setItems] = useState<Merchandise[]>([]);
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try { setItems(await apiRequest<Merchandise[]>("/api/admin/revamp")); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load merchandise."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    let active = true;
    apiRequest<Merchandise[]>("/api/admin/revamp")
      .then((data) => { if (active) setItems(data); })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Could not load merchandise."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function createItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await apiRequest("/api/admin/revamp", { method: "POST", body: JSON.stringify({ ...form, price: Number(form.price) }) });
      setForm(initialForm);
      setNotice("Merchandise saved.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save merchandise.");
    } finally { setSaving(false); }
  }

  async function updateStatus(item: Merchandise, status: Merchandise["status"]) {
    setError("");
    setNotice("");
    try {
      const updated = await apiRequest<Merchandise>(`/api/admin/revamp/${item._id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      setItems((current) => current.map((entry) => entry._id === item._id ? updated : entry));
      setNotice("Merchandise status updated.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update merchandise."); }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header><p className="text-xs font-semibold uppercase tracking-wide text-primary">Admin / Revamp!</p><h1 className="mt-1 text-2xl font-bold text-ink">Merchandise management</h1><p className="mt-2 text-sm text-ink-muted">Register upcycled merchandise and control its public availability.</p></header>
      <p className="rounded-xl border border-warning/30 bg-warning/10 p-3 text-xs text-ink"><strong>Workflow note:</strong> Management statuses are draft, available, and archived only. A product-specific Revamp business workflow has not been confirmed.</p>
      {error && <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p>}
      {notice && <p role="status" className="rounded-xl bg-success/10 p-3 text-sm text-success">{notice}</p>}
      <form onSubmit={createItem} className="grid gap-3 rounded-2xl bg-white p-5 shadow-card sm:grid-cols-2">
        <h2 className="text-base font-semibold text-ink sm:col-span-2">Register merchandise</h2>
        {([["name", "Product name"], ["category", "Category"], ["size", "Size"], ["condition", "Condition"], ["price", "Price (Rp)"], ["image", "Image URL"]] as const).map(([field, label]) => <label key={field} className="block text-xs font-medium text-ink">{label}<input required name={field} type={field === "price" ? "number" : field === "image" ? "url" : "text"} min={field === "price" ? 1 : undefined} value={form[field]} onChange={(event) => setForm((value) => ({ ...value, [field]: event.target.value }))} className="form-input mt-1" /></label>)}
        <label className="block text-xs font-medium text-ink sm:col-span-2">Description<textarea required maxLength={2000} value={form.description} onChange={(event) => setForm((value) => ({ ...value, description: event.target.value }))} className="form-input mt-1 min-h-24" /></label>
        <label className="block text-xs font-medium text-ink">Initial status<select value={form.status} onChange={(event) => setForm((value) => ({ ...value, status: event.target.value as Merchandise["status"] }))} className="form-input mt-1"><option value="draft">Draft</option><option value="available">Available</option><option value="archived">Archived</option></select></label>
        <div className="flex items-end"><button type="submit" disabled={saving} className="min-h-11 w-full rounded-full bg-primary text-sm font-semibold text-white disabled:opacity-60">{saving ? "Saving…" : "Save merchandise"}</button></div>
      </form>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-ink">Registered merchandise</h2>
        {loading ? <p role="status" className="rounded-xl bg-white p-4 text-sm text-ink-muted">Loading merchandise…</p> : items.length ? items.map((item) => <article key={item._id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-card"><div><h3 className="font-semibold text-ink">{item.name}</h3><p className="mt-1 text-xs text-ink-muted">{item.category} · {item.size} · Rp{item.price.toLocaleString("id-ID")}</p><p className="mt-1 text-xs text-ink-muted">Status: <strong className="capitalize">{item.status}</strong></p></div><label className="text-xs text-ink-muted">Update status<select value={item.status} onChange={(event) => void updateStatus(item, event.target.value as Merchandise["status"])} className="form-input mt-1 min-h-10"><option value="draft">Draft</option><option value="available">Available</option><option value="archived">Archived</option></select></label></article>) : <p className="rounded-xl bg-white p-4 text-sm text-ink-muted">No Revamp! merchandise has been registered.</p>}
      </section>
    </div>
  );
}
