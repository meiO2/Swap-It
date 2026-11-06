"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Heart, Leaf, PackageCheck, Sparkles } from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import ProductCard from "@/components/ui/ProductCard";
import type { Product } from "@/data/mock";
import { mapApiProduct, type ApiProduct } from "@/lib/products";

export default function HomePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/products?limit=6")
      .then(async (response) => {
        const result = await response.json() as { success: boolean; data?: ApiProduct[] };
        if (!response.ok || !result.success) throw new Error("Failed to load products.");
        setProducts((result.data ?? []).map(mapApiProduct));
      })
      .catch((error) => console.error("Home products error:", error))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main>
      <TopBar />

      <section className="px-4 pt-5">
        <Link href="/swap" className="group relative block min-h-[196px] overflow-hidden rounded-3xl bg-mint-100 shadow-card">
          <Image
            src="https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1100&q=85"
            alt="Friends choosing outfits together"
            fill
            priority
            sizes="(max-width: 430px) 100vw, 430px"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-ink/65 via-ink/25 to-transparent" />
          <div className="relative flex min-h-[196px] flex-col items-start justify-center p-5 text-white">
            <span className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-[10px] font-medium backdrop-blur-sm">
              <Leaf size={13} /> Swap more, waste less
            </span>
            <h2 className="max-w-[230px] text-2xl font-bold leading-tight">Got Clothes to Spare? Trade &apos;em!</h2>
            <span className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-semibold text-primary transition group-hover:bg-mint-50">
              Start swapping <ArrowRight size={15} />
            </span>
          </div>
        </Link>
      </section>

      <section className="px-4 pt-7">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-primary">Find your next favorite</p>
            <h2 className="mt-1 text-lg font-semibold text-ink">Search What You Need</h2>
          </div>
          <Link href="/products" className="mb-0.5 text-xs font-semibold text-primary">See all</Link>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {loading ? <p className="col-span-2 py-8 text-center text-sm text-ink-muted">Loading products...</p> : products.length > 0 ? products.map((product, index) => <ProductCard key={product.id} product={product} priority={index === 0} />) : (
            <p className="col-span-2 rounded-2xl bg-mint-50 p-5 text-center text-sm text-ink-muted">No products are available yet.</p>
          )}
        </div>
      </section>

      <section className="px-4 pt-7">
        <Link href="/revamp/shop" className="group flex items-center gap-3 rounded-2xl bg-primary p-4 text-white shadow-primary transition hover:bg-primary-dark">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/15">
            <PackageCheck size={21} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-medium text-white/80">Give textiles a new life</span>
            <span className="mt-0.5 block text-base font-semibold">Shop Revamp! merchandise</span>
          </span>
          <ArrowRight size={18} className="shrink-0 transition group-hover:translate-x-1" />
        </Link>
      </section>

      <section className="px-4 pb-6 pt-7">
        <div className="rounded-2xl bg-mint-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="flex items-center gap-1.5 text-xs font-semibold text-primary"><Sparkles size={14} /> Small choices, real impact</p>
              <h2 className="mt-1 text-sm font-semibold text-ink">Your wardrobe can go further.</h2>
              <p className="mt-1 text-xs leading-relaxed text-ink-muted">Swap, repair, or donate the pieces you no longer wear.</p>
            </div>
            <Link href="/news" aria-label="Read Swap News" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-primary shadow-card">
              <Heart size={18} />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
