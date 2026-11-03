"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Heart, MapPin, MessageCircle, ShieldCheck, ShoppingBag } from "lucide-react";
import { useState } from "react";
import { catalogProducts } from "@/data/mock";
import { formatGP, formatRupiah } from "@/lib/format";
import { useSwapStore } from "@/store/useSwapStore";

export default function ProductDetail({ id }: { id: string }) {
  const product = catalogProducts.find((item) => item.id === id);
  const addToCart = useSwapStore((state) => state.addToCart);
  const router = useRouter();
  const [saved, setSaved] = useState(false);
  const [added, setAdded] = useState(false);

  if (!product) {
    return <main className="px-4 py-8"><h1 className="text-lg font-semibold">This listing is no longer available.</h1><Link href="/" className="mt-4 inline-block text-sm font-semibold text-primary">Back to home</Link></main>;
  }

  return (
    <main className="pb-6">
      <div className="relative aspect-[4/4.2] bg-mint-50">
        <Image src={product.image} alt={product.imageAlt} fill priority sizes="(max-width: 430px) 100vw, 430px" className="object-cover" />
        <Link href="/" aria-label="Back home" className="absolute left-4 top-4 flex size-10 items-center justify-center rounded-full bg-white/90 text-ink"><ArrowLeft size={19} /></Link>
        <button type="button" aria-label={saved ? "Remove from saved items" : "Save item"} onClick={() => setSaved((value) => !value)} className={`absolute right-4 top-4 flex size-10 items-center justify-center rounded-full bg-white/90 ${saved ? "text-danger" : "text-ink"}`}><Heart size={19} fill={saved ? "currentColor" : "none"} /></button>
      </div>
      <div className="space-y-5 px-4 pt-5">
        <section>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-ink-muted">{product.category} · {product.condition}</p>
              <h1 className="mt-1 text-xl font-semibold text-ink">{product.name}</h1>
            </div>
            <span className="shrink-0 rounded-full bg-mint-50 px-3 py-1.5 text-xs font-semibold text-ink">Size {product.size}</span>
          </div>
          <p className="mt-3 text-xl font-bold text-primary">{formatRupiah(product.price)}</p>
          <p className="text-xs text-ink-muted">or {formatGP(product.gpPrice)} · 1 GP = Rp1</p>
        </section>
        <section className="flex items-center gap-3 rounded-2xl bg-mint-50 p-3">
          <span className="flex size-11 items-center justify-center rounded-full bg-white text-primary"><ShieldCheck size={20} /></span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink">{product.seller}</p>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-muted"><MapPin size={12} /> {product.distance}</p>
          </div>
          <span className="rounded-full bg-primary px-2.5 py-1 text-[10px] font-semibold text-white">Verified</span>
        </section>
        <section>
          <h2 className="text-sm font-semibold text-ink">About this piece</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">A well-loved preloved find, ready for another chapter. Ask the seller for any extra details before you decide.</p>
        </section>
        <div className="grid grid-cols-2 gap-2">
          <Link href={`/chat/${product.seller === "Raka Aditya" ? "raka" : "nadia"}?product=${product.id}`} className="flex h-11 items-center justify-center gap-2 rounded-full border border-border bg-white text-xs font-semibold text-ink hover:bg-mint-50"><MessageCircle size={16} /> Chat seller</Link>
          <button type="button" onClick={() => { addToCart(product.id); setAdded(true); }} className="flex h-11 items-center justify-center gap-2 rounded-full border border-primary text-xs font-semibold text-primary hover:bg-mint-50"><ShoppingBag size={16} /> {added ? "Added to cart" : "Add to cart"}</button>
        </div>
        <button type="button" onClick={() => { addToCart(product.id); router.push("/checkout"); }} className="h-12 w-full rounded-full bg-primary text-sm font-semibold text-white shadow-primary hover:bg-primary-dark">Buy now</button>
      </div>
    </main>
  );
}
