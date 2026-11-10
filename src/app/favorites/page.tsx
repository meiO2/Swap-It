"use client";

import Link from "next/link";
import { ArrowLeft, Heart } from "lucide-react";
import { useEffect, useState } from "react";
import ProductCard from "@/components/ui/ProductCard";
import { readFavorites } from "@/lib/favorites";
import { mapApiProduct, type ApiProduct } from "@/lib/products";
import type { Product } from "@/data/mock";

export default function FavoritesPage() {
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const ids = readFavorites();
      if (!ids.length) { setItems([]); setLoading(false); return; }
      const results = await Promise.all(ids.map(async (id) => {
        const response = await fetch(`/api/products/${id}`, { cache: "no-store" });
        const result = await response.json();
        return response.ok && result.success ? mapApiProduct(result.data as ApiProduct) : null;
      }));
      setItems(results.filter((item): item is Product => item !== null));
      setLoading(false);
    };
    void load();
  }, []);

  return <main className="px-4 pb-6 pt-5">
    <header className="mb-5 flex items-center gap-3"><Link href="/profile" aria-label="Back to profile" className="rounded-full p-2 text-ink-muted hover:bg-mint-50"><ArrowLeft size={20} /></Link><div><p className="text-xs font-medium uppercase tracking-[0.12em] text-primary">Your saved style</p><h1 className="mt-1 text-xl font-semibold text-ink">Favorites</h1></div></header>
    {loading ? <p className="rounded-xl bg-white p-4 text-sm text-ink-muted">Loading favorites…</p> : items.length ? <div className="grid grid-cols-2 gap-3">{items.map((item) => <ProductCard key={item.id} product={item} />)}</div> : <section className="rounded-2xl bg-mint-50 px-5 py-10 text-center"><span className="mx-auto flex size-12 items-center justify-center rounded-full bg-white text-primary"><Heart size={22} /></span><h2 className="mt-4 text-base font-semibold text-ink">No favorites yet</h2><p className="mt-1 text-xs leading-relaxed text-ink-muted">Tap the heart on any marketplace item to save it here.</p><Link href="/products" className="mt-5 inline-flex rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white">Explore marketplace</Link></section>}
  </main>;
}
