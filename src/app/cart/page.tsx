"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ShoppingBag, Trash2 } from "lucide-react";
import { catalogProducts } from "@/data/mock";
import { formatRupiah } from "@/lib/format";
import { useSwapStore } from "@/store/useSwapStore";

export default function CartPage() {
  const cart = useSwapStore((state) => state.cart);
  const removeFromCart = useSwapStore((state) => state.removeFromCart);
  const entries = cart.map((item) => ({ item, product: catalogProducts.find((product) => product.id === item.productId) })).filter((entry) => entry.product);
  const subtotal = entries.reduce((sum, entry) => sum + entry.product!.price * entry.item.quantity, 0);

  return (
    <main className="px-4 pb-6 pt-5">
      <header className="mb-5 flex items-center gap-3">
        <Link href="/" aria-label="Back home" className="rounded-full p-2 text-ink-muted hover:bg-mint-50"><ArrowLeft size={20} /></Link>
        <div><h1 className="text-xl font-semibold text-ink">Your cart</h1><p className="text-xs text-ink-muted">{entries.length} item{entries.length === 1 ? "" : "s"}</p></div>
      </header>
      {entries.length === 0 ? (
        <section className="rounded-2xl bg-mint-50 p-6 text-center">
          <ShoppingBag className="mx-auto text-primary" size={30} />
          <h2 className="mt-3 text-base font-semibold text-ink">Your cart is waiting</h2>
          <p className="mt-1 text-sm text-ink-muted">Find a preloved piece to make it yours.</p>
          <Link href="/" className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-xs font-semibold text-white">Explore finds <ArrowRight size={14} /></Link>
        </section>
      ) : (
        <>
          <div className="space-y-3">
            {entries.map(({ item, product }) => product && (
              <article key={item.productId} className="flex gap-3 rounded-2xl bg-white p-3 shadow-card">
                <div className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-mint-50"><Image src={product.image} alt={product.imageAlt} fill sizes="80px" className="object-cover" /></div>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-sm font-semibold text-ink">{product.name}</h2>
                  <p className="mt-1 text-xs text-ink-muted">Size {product.size} · Qty {item.quantity}</p>
                  <p className="mt-2 text-sm font-semibold text-primary">{formatRupiah(product.price * item.quantity)}</p>
                </div>
                <button type="button" aria-label={`Remove ${product.name} from cart`} onClick={() => removeFromCart(item.productId)} className="self-start rounded-full p-2 text-ink-muted hover:bg-danger/10 hover:text-danger"><Trash2 size={16} /></button>
              </article>
            ))}
          </div>
          <div className="mt-5 rounded-2xl bg-white p-4 shadow-card">
            <div className="flex justify-between text-sm text-ink"><span>Product subtotal</span><span className="font-semibold">{formatRupiah(subtotal)}</span></div>
            <p className="mt-1 text-xs text-ink-muted">Shipping and service fees are calculated separately at checkout.</p>
            <Link href="/checkout" className="mt-4 flex h-11 items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold text-white shadow-primary hover:bg-primary-dark">Continue to checkout <ArrowRight size={16} /></Link>
          </div>
        </>
      )}
    </main>
  );
}
