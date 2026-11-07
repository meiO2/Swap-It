
"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Heart,
  MapPin,
  MessageCircle,
  ShieldCheck,
  ShoppingBag,
} from "lucide-react";
import { useEffect, useState } from "react";
import { formatRupiah } from "@/lib/format";

interface Product {
  _id: string;
  sellerId: string | {
    _id: string;
    name?: string;
  };
  name: string;
  description: string;
  category: string;
  brand?: string;
  price: number;
  size: string;
  condition: string;
  images: string[];
  status: string;
}

export default function ProductDetail({ id }: { id: string }) {
  const router = useRouter();

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [added, setAdded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    let active = true;

    async function fetchProduct() {
      try {
        setLoading(true);
        setError("");

        const response = await fetch(`/api/products/${id}`, {
          cache: "no-store",
        });

        const result = await response.json();

        if (!response.ok || !result.success || !result.data) {
          throw new Error(
            result.message || "This product is no longer available.",
          );
        }

        if (!active) return;

        const productData = result.data as Product;
        setProduct(productData);

        // Identify the currently authenticated user.
        try {
          const authResponse = await fetch("/api/auth/me", {
            cache: "no-store",
          });

          if (authResponse.ok) {
            const authResult = await authResponse.json();
            const currentUserId = authResult.data?.id;

            const productSellerId =
              typeof productData.sellerId === "string"
                ? productData.sellerId
                : productData.sellerId?._id;

            const owner = currentUserId === productSellerId;

            if (active) {
              setIsOwner(owner);
            }

            // Sellers should not need their own product in their cart.
            if (owner) return;
          }
        } catch {
          // Authentication lookup should not prevent public product viewing.
        }

        if (!active) return;

        // Check whether the product is already in the buyer's cart.
        try {
          const cartResponse = await fetch("/api/cart", {
            cache: "no-store",
          });

          if (cartResponse.ok) {
            const cartResult = await cartResponse.json();

            const inCart = cartResult.success &&
              cartResult.data?.items?.some(
                (item: { productId?: { _id?: string } | string }) =>
                  typeof item.productId === "string"
                    ? item.productId === productData._id
                    : item.productId?._id === productData._id,
              );

            if (active) {
              setAdded(Boolean(inCart));
            }
          }
        } catch {
          // Cart availability should not prevent the product from loading.
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load product.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchProduct();

    return () => {
      active = false;
    };
  }, [id]);

  async function handleAddToCart(redirectToCheckout = false) {
    if (!product || adding) return;

    try {
      setAdding(true);
      setError("");

      const response = await fetch("/api/cart", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          productId: product._id,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Failed to add product to cart.");
      }

      setAdded(true);
      window.dispatchEvent(new Event("cart-updated"));

      if (redirectToCheckout) {
        router.push("/checkout");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong.",
      );
    } finally {
      setAdding(false);
    }
  }

  function handleBuyNow() {
    if (adding || !product) return;
    if (added) {
      router.push("/checkout");
      return;
    }
    void handleAddToCart(true);
  }

  if (loading) {
    return (
      <main className="px-4 py-8">
        <p className="text-sm text-ink-muted">Loading product...</p>
      </main>
    );
  }

  if (!product) {
    return (
      <main className="px-4 py-8">
        <h1 className="text-lg font-semibold">
          {error || "This listing is no longer available."}
        </h1>
        <Link
          href="/"
          className="mt-4 inline-block text-sm font-semibold text-primary"
        >
          Back to home
        </Link>
      </main>
    );
  }

  const seller =
    typeof product.sellerId === "object"
      ? product.sellerId.name || "SwapIt seller"
      : "SwapIt seller";

  const image = product.images?.[0] || "/logo.png";

  return (
    <main className="pb-6">
      <div className="relative aspect-[4/4.2] bg-mint-50">
        <Image
          src={image}
          alt={product.name}
          fill
          priority
          sizes="(max-width: 430px) 100vw, 430px"
          className="object-cover"
        />

        <Link
          href="/"
          aria-label="Back home"
          className="absolute left-4 top-4 flex size-10 items-center justify-center rounded-full bg-white/90 text-ink"
        >
          <ArrowLeft size={19} />
        </Link>

        <button
          type="button"
          aria-label={saved ? "Remove from saved items" : "Save item"}
          onClick={() => setSaved((value) => !value)}
          className={`absolute right-4 top-4 flex size-10 items-center justify-center rounded-full bg-white/90 ${
            saved ? "text-danger" : "text-ink"
          }`}
        >
          <Heart size={19} fill={saved ? "currentColor" : "none"} />
        </button>
      </div>

      <div className="space-y-5 px-4 pt-5">
        <section>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-ink-muted">
                {product.category} · {product.condition}
              </p>

              <h1 className="mt-1 text-xl font-semibold text-ink">
                {product.name}
              </h1>
            </div>

            <span className="shrink-0 rounded-full bg-mint-50 px-3 py-1.5 text-xs font-semibold text-ink">
              Size {product.size}
            </span>
          </div>

          <p className="mt-3 text-xl font-bold text-primary">
            {formatRupiah(product.price)}
          </p>
        </section>

        <section className="flex items-center gap-3 rounded-2xl bg-mint-50 p-3">
          <span className="flex size-11 items-center justify-center rounded-full bg-white text-primary">
            <ShieldCheck size={20} />
          </span>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink">{seller}</p>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-muted">
              <MapPin size={12} />
              SwapIt marketplace
            </p>
          </div>

          <span className="rounded-full bg-primary px-2.5 py-1 text-[10px] font-semibold text-white">
            Seller
          </span>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-ink">
            About this piece
          </h2>

          <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
            {product.description}
          </p>

          {product.brand && (
            <p className="mt-2 text-sm text-ink-muted">
              Brand: {product.brand}
            </p>
          )}
        </section>

        {error && (
          <p className="rounded-xl bg-red-50 p-3 text-sm text-danger">
            {error}
          </p>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Link
            href="/chat"
            className="flex h-11 items-center justify-center gap-2 rounded-full border border-border bg-white text-xs font-semibold text-ink hover:bg-mint-50"
          >
            <MessageCircle size={16} />
            Chat seller
          </Link>

          <button
            type="button"
            disabled={adding || added}
            onClick={() => handleAddToCart()}
            className="flex h-11 items-center justify-center gap-2 rounded-full border border-primary text-xs font-semibold text-primary hover:bg-mint-50 disabled:opacity-60"
          >
            <ShoppingBag size={16} />
            {adding ? "Adding..." : added ? "Already in cart" : "Add to cart"}
          </button>
        </div>

        <button
          type="button"
          disabled={adding}
          onClick={handleBuyNow}
          className="h-12 w-full rounded-full bg-primary text-sm font-semibold text-white shadow-primary hover:bg-primary-dark disabled:opacity-60"
        >
          {adding ? "Please wait..." : "Buy now"}
        </button>
      </div>
    </main>
  );
}
