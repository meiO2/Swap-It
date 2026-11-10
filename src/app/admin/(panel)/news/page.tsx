"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { apiRequest } from "@/lib/api";

type NewsItem = { _id: string; title: string; date: string; description: string; clothesDistributed: number; image: string; status: "draft" | "published" };
const initialForm = { title: "", date: "", description: "", clothesDistributed: "", image: "", status: "draft" as NewsItem["status"] };

export default function AdminNewsPage() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try { setItems(await apiRequest<NewsItem[]>("/api/admin/news")); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load news."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    let active = true;
    apiRequest<NewsItem[]>("/api/admin/news")
      .then((data) => { if (active) setItems(data); })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Could not load news."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function createNews(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      if (editingId) {
        const updated = await apiRequest<NewsItem>(`/api/admin/news/${editingId}`, { method: "PATCH", body: JSON.stringify({ ...form, clothesDistributed: Number(form.clothesDistributed) }) });
        setItems((current) => current.map((item) => item._id === editingId ? updated : item));
      } else {
        await apiRequest("/api/admin/news", { method: "POST", body: JSON.stringify({ ...form, clothesDistributed: Number(form.clothesDistributed) }) });
      }
      setForm(initialForm);
      setEditingId(null);
      setNotice(editingId ? "Published news updated." : "News saved.");
      if (!editingId) await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save this news item."); }
    finally { setSaving(false); }
  }

  async function uploadImage(file: File | undefined) {
    if (!file) return;
    setUploadingImage(true);
    setError("");
    try {
      const imageData = new FormData();
      imageData.append("images", file);
      const [image] = await apiRequest<string[]>("/api/uploads", { method: "POST", body: imageData });
      if (!image) throw new Error("The uploaded image URL was not returned.");
      setForm((value) => ({ ...value, image }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not upload image.");
    } finally {
      setUploadingImage(false);
    }
  }

  async function changeStatus(item: NewsItem, status: NewsItem["status"]) {
    setError("");
    setNotice("");
    try {
      const updated = await apiRequest<NewsItem>(`/api/admin/news/${item._id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      setItems((current) => current.map((entry) => entry._id === item._id ? updated : entry));
      setNotice(status === "published" ? "News published." : "News moved to draft.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update news."); }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header><p className="text-xs font-semibold uppercase tracking-wide text-primary">Admin / News</p><h1 className="mt-1 text-2xl font-bold text-ink">Swap News management</h1><p className="mt-2 text-sm text-ink-muted">Public news uses title, date, description, clothes distributed, and image fields.</p></header>
      {error && <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p>}
      {notice && <p role="status" className="rounded-xl bg-success/10 p-3 text-sm text-success">{notice}</p>}
      <form onSubmit={createNews} className="grid gap-3 rounded-2xl bg-white p-5 shadow-card sm:grid-cols-2">
        <div className="flex items-center justify-between gap-3 sm:col-span-2"><h2 className="text-base font-semibold text-ink">{editingId ? "Edit news" : "Create news"}</h2>{editingId && <button type="button" onClick={() => { setEditingId(null); setForm(initialForm); }} className="text-xs font-semibold text-primary">Cancel edit</button>}</div>
        <label className="block text-xs font-medium text-ink">Title<input required maxLength={160} value={form.title} onChange={(event) => setForm((value) => ({ ...value, title: event.target.value }))} className="form-input mt-1" /></label>
        <label className="block text-xs font-medium text-ink">Date<input required type="date" value={form.date} onChange={(event) => setForm((value) => ({ ...value, date: event.target.value }))} className="form-input mt-1" /></label>
        <label className="block text-xs font-medium text-ink">Clothes distributed<input required type="number" min={0} step={1} value={form.clothesDistributed} onChange={(event) => setForm((value) => ({ ...value, clothesDistributed: event.target.value }))} className="form-input mt-1" /></label>
        <div className="space-y-2 text-xs font-medium text-ink"><label className="block">Upload image from device<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void uploadImage(event.target.files?.[0])} className="mt-1 block w-full text-xs text-ink-muted" /></label><p className="text-[10px] font-normal text-ink-muted">JPEG, PNG, or WebP; maximum 5 MB.</p>{uploadingImage && <p className="text-xs text-primary">Uploading image…</p>}<label className="block">Image URL<input required value={form.image} onChange={(event) => setForm((value) => ({ ...value, image: event.target.value }))} placeholder="Uploaded image URL" className="form-input mt-1" /></label></div>
        <label className="block text-xs font-medium text-ink sm:col-span-2">Content<textarea required maxLength={5000} value={form.description} onChange={(event) => setForm((value) => ({ ...value, description: event.target.value }))} className="form-input mt-1 min-h-28" /></label>
        <label className="block text-xs font-medium text-ink">Save as<select value={form.status} onChange={(event) => setForm((value) => ({ ...value, status: event.target.value as NewsItem["status"] }))} className="form-input mt-1"><option value="draft">Draft</option><option value="published">Published</option></select></label>
        <div className="flex items-end"><button type="submit" disabled={saving || uploadingImage} className="min-h-11 w-full rounded-full bg-primary text-sm font-semibold text-white disabled:opacity-60">{saving ? "Saving…" : editingId ? "Save changes" : "Save news"}</button></div>
      </form>
      <section className="space-y-3"><h2 className="text-lg font-semibold text-ink">Saved news</h2>
        {loading ? <p role="status" className="rounded-xl bg-white p-4 text-sm text-ink-muted">Loading news…</p> : items.length ? items.map((item) => <article key={item._id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-card"><div className="min-w-0"><h3 className="font-semibold text-ink">{item.title}</h3><p className="mt-1 text-xs text-ink-muted">{item.date} · {item.clothesDistributed} clothes distributed · {item.status}</p></div><div className="flex gap-2"><button type="button" onClick={() => { setEditingId(item._id); setForm({ title: item.title, date: item.date, description: item.description, clothesDistributed: String(item.clothesDistributed), image: item.image, status: item.status }); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="min-h-10 rounded-full border border-border px-4 text-xs font-semibold text-ink">Edit</button><button type="button" onClick={() => void changeStatus(item, item.status === "published" ? "draft" : "published")} className="min-h-10 rounded-full border border-primary px-4 text-xs font-semibold text-primary">{item.status === "published" ? "Unpublish" : "Publish"}</button></div></article>) : <p className="rounded-xl bg-white p-4 text-sm text-ink-muted">No news has been created.</p>}
      </section>
    </div>
  );
}
