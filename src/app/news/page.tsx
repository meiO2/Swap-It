"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Shirt } from "lucide-react";
import { apiRequest } from "@/lib/api";
import { formatShortDate } from "@/lib/format";

type NewsItem = { _id: string; title: string; date: string; description: string; clothesDistributed: number; image: string };

function getExcerpt(content: string) {
  const firstParagraph = content.trim().split(/\n\s*\n/)[0] ?? "";
  return firstParagraph.length > 180 ? `${firstParagraph.slice(0, 177).trimEnd()}…` : firstParagraph;
}

export default function SwapNewsPage() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    apiRequest<NewsItem[]>("/api/news")
      .then(setItems)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load Swap News."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="px-4 pb-6 pt-5">
      <header className="mb-5 flex items-center gap-3"><Link href="/" aria-label="Back home" className="rounded-full p-2 text-ink-muted hover:bg-mint-50"><ArrowLeft size={20} /></Link><div><h1 className="text-xl font-semibold text-ink">Swap News</h1><p className="text-xs text-ink-muted">Where donated clothes find their next home</p></div></header>
      {error && <p role="alert" className="mb-4 rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p>}
      {loading ? <p role="status" className="rounded-xl bg-white p-4 text-sm text-ink-muted">Loading news…</p> : items.length ? (
        <div className="space-y-4">
          {items.map((item) => <Link href={`/news/${item._id}`} key={item._id} className="block overflow-hidden rounded-2xl bg-white shadow-card transition hover:-translate-y-0.5">
            <div role="img" aria-label={`${item.title} image`} className="aspect-[16/9] bg-mint-50 bg-cover bg-center" style={{ backgroundImage: `url("${item.image.replaceAll('"', "%22")}")` }} />
            <div className="p-4"><p className="text-[10px] font-medium text-primary">{formatShortDate(item.date)}</p><h2 className="mt-1 text-base font-semibold text-ink">{item.title}</h2><p className="mt-2 text-xs leading-relaxed text-ink-muted">{getExcerpt(item.description)}</p><span className="mt-2 inline-block text-xs font-semibold text-primary">Read article →</span><p className="mt-3 flex items-center gap-2 rounded-xl bg-mint-50 p-3 text-xs font-semibold text-primary"><Shirt size={15} /> {item.clothesDistributed} clothes distributed</p></div>
          </Link>)}
        </div>
      ) : <p className="rounded-2xl bg-white p-5 text-sm text-ink-muted">{error ? "News is unavailable right now." : "No published news yet."}</p>}
    </main>
  );
}
