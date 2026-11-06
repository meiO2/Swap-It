
"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  ShoppingBag,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { formatRupiah } from "@/lib/format";

interface CartProduct {
  _id: string;
  name: string;
  price: number;
  size: string;
  condition: string;
  images: string[];
  status: string;
}

interface CartItem {
  productId: CartProduct;
  addedAt: string;
}

export default function CartPage() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [subtotal, setSubtotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState("");

  const fetchCart = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const response = await fetch("/api/cart", {
        cache: "no-store",
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Failed to load your cart.");
      }

      setItems(result.data.items || []);
      setSubtotal(result.data.subtotal || 0);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong while loading your cart.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCart();
  }, [fetchCart]);

  async function handleRemove(productId: string) {
    try {
      setRemoving(productId);
      setError("");

      const response = await fetch("/api/cart", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ productId }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Failed to remove product.");
      }

      await fetchCart();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to remove product from cart.",
      );
    } finally {
      setRemoving(null);
    }
  }

  return (
    <main className="px-4 pb-6 pt-5">
      <header className="mb-5 flex items-center gap-3">
        <Link
          href="/"
          aria-label="Back home"
          className="rounded-full p-2 text-ink-muted hover:bg-mint-50"
        >
          <ArrowLeft size={20} />
        </Link>

        <div>
          <h1 className="text-xl font-semibold text-ink">Your cart</h1>
          <p className="text-xs text-ink-muted">
            {items.length} item{items.length === 1 ? "" : "s"}
          </p>
        </div>
      </header>

      {loading ? (
        <section className="rounded-2xl bg-mint-50 p-6 text-center">
          <ShoppingBag className="mx-auto animate-pulse text-primary" size={30} />
          <p className="mt-3 text-sm text-ink-muted">
            Loading your cart...
          </p>
        </section>
      ) : error && items.length === 0 ? (
        <section className="rounded-2xl bg-mint-50 p-6 text-center">
          <p className="text-sm text-danger">{error}</p>
          <button
            type="button"
            onClick={fetchCart}
            className="mt-4 rounded-full bg-primary px-5 py-2.5 text-xs font-semibold text-white"
          >
            Try again
          </button>
        </section>
      ) : items.length === 0 ? (
        <section className="rounded-2xl bg-mint-50 p-6 text-center">
          <ShoppingBag className="mx-auto text-primary" size={30} />

          <h2 className="mt-3 text-base font-semibold text-ink">
            Your cart is waiting
          </h2>

          <p className="mt-1 text-sm text-ink-muted">
            Find a preloved piece to make it yours.
          </p>

          <Link
            href="/"
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-xs font-semibold text-white"
          >
            Explore finds <ArrowRight size={14} />
          </Link>
        </section>
      ) : (
        <>
          {error && (
            <p className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-danger">
              {error}
            </p>
          )}

          <div className="space-y-3">
            {items.map((item) => {
              const product = item.productId;

              if (!product || !product._id) return null;

              const image = product.images?.[0] || "/logo.png";

              return (
                <article
                  key={product._id}
                  className="flex gap-3 rounded-2xl bg-white p-3 shadow-card"
                >
                  <Link
                    href={`/products/${product._id}`}
                    className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-mint-50"
                  >
                    <Image
                      src={image}
                      alt={product.name}
                      fill
                      sizes="80px"
                      className="object-cover"
                    />
                  </Link>

                  <div className="min-w-0 flex-1">
                    <Link href={`/products/${product._id}`}>
                      <h2 className="truncate text-sm font-semibold text-ink">
                        {product.name}
                      </h2>
                    </Link>

                    <p className="mt-1 text-xs text-ink-muted">
                      Size {product.size} · {product.condition}
                    </p>

                    <p className="mt-2 text-sm font-semibold text-primary">
                      {formatRupiah(product.price)}
                    </p>
                  </div>

                  <button
                    type="button"
                    aria-label={`Remove ${product.name} from cart`}
                    disabled={removing === product._id}
                    onClick={() => handleRemove(product._id)}
                    className="self-start rounded-full p-2 text-ink-muted hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                  >
                    {removing === product._id ? (
                      <span className="text-xs">...</span>
                    ) : (
                      <Trash2 size={16} />
                    )}
                  </button>
                </article>
              );
            })}
          </div>

          <div className="mt-5 rounded-2xl bg-white p-4 shadow-card">
            <div className="flex justify-between text-sm text-ink">
              <span>Product subtotal</span>
              <span className="font-semibold">
                {formatRupiah(subtotal)}
              </span>
            </div>

            <p className="mt-1 text-xs text-ink-muted">
              Shipping and service fees are calculated separately at checkout.
            </p>

            <Link
              href="/checkout"
              className="mt-4 flex h-11 items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold text-white shadow-primary hover:bg-primary-dark"
            >
              Continue to checkout <ArrowRight size={16} />
            </Link>
          </div>
        </>
      )}
    </main>
  );
}
