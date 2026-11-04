"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { apiRequest } from "@/lib/api";
import { formatRupiah } from "@/lib/format";

type Merchandise = { _id: string; name: string; category: string; size: string; condition: string; description: string; price: number; image: string };

export default function RevampShopPage() {
  const [items, setItems] = useState<Merchandise[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    apiRequest<Merchandise[]>("/api/revamp")
      .then(setItems)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load Revamp merchandise."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="px-4 pb-6 pt-5">
      <header className="mb-5 flex items-center gap-3"><Link href="/revamp" aria-label="Back to Revamp" className="rounded-full p-2 text-ink-muted hover:bg-mint-50"><ArrowLeft size={20} /></Link><div><h1 className="text-xl font-semibold text-ink">Revamp! shop</h1><p className="text-xs text-ink-muted">Upcycled in small batches</p></div></header>
      <div className="mb-4 rounded-2xl bg-mint-50 p-3 text-xs leading-relaxed text-ink-muted">Each piece gives rescued textiles a new purpose. Checkout with money, Green Points, or a mix.</div>
      {error && <p role="alert" className="mb-4 rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p>}
      {loading ? <p role="status" className="rounded-xl bg-white p-4 text-sm text-ink-muted">Loading merchandise…</p> : items.length ? <div className="grid grid-cols-2 gap-3">{items.map((item) => (
        <article key={item._id} className="overflow-hidden rounded-2xl bg-white shadow-card">
          <div role="img" aria-label={`${item.name} image`} className="aspect-[4/4.7] bg-mint-50 bg-cover bg-center" style={{ backgroundImage: `url("${item.image.replaceAll('"', "%22")}")` }} />
          <div className="p-3"><p className="truncate text-[13px] font-medium text-ink">{item.name}</p><p className="mt-1 text-xs text-ink-muted">{item.condition} · {item.size}</p><p className="mt-2 text-sm font-semibold text-primary">{formatRupiah(item.price)}</p><p className="mt-1 text-[10px] text-ink-muted">{item.category}</p></div>
        </article>
      ))}</div> : <p className="rounded-2xl bg-white p-5 text-sm text-ink-muted">{error ? "Merchandise is unavailable right now." : "No Revamp! products are currently available."}</p>}
    </main>
  );
}
