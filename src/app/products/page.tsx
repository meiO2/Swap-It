
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import ProductCard from "@/components/ui/ProductCard";
import type { Product } from "@/data/mock";

interface ApiProduct {
  _id: string;
  name: string;
  description: string;
  categoryId: string;
  price: number;
  size: string;
  condition: "NEW" | "LIKE_NEW" | "GOOD" | "FAIR";
  images: string[];
  sellerId: string;
}

interface ProductsResponse {
  success: boolean;
  data: ApiProduct[];
  message?: string;
  pagination?: {
    page: number;
    totalPages: number;
    total: number;
  };
}

function formatCondition(condition: ApiProduct["condition"]) {
  const labels = {
    NEW: "New",
    LIKE_NEW: "Like new",
    GOOD: "Good",
    FAIR: "Fair",
  };

  return labels[condition];
}

export default function MarketplacePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchProducts() {
      try {
        setLoading(true);
        setError("");

        const response = await fetch("/api/products");
        const result: ProductsResponse = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(
            result.message || "Failed to load marketplace products."
          );
        }

        const mappedProducts: Product[] = result.data.map((item) => ({
          id: item._id,
          name: item.name,
          category: item.categoryId,
          size: item.size,
          condition: formatCondition(item.condition),
          gpPrice: item.price,
          price: item.price,
          image: item.images?.[0] || "/logo.png",
          imageAlt: item.name,
          seller: "SwapIt member",
          distance: "",
        }));

        setProducts(mappedProducts);
      } catch (err) {
        console.error("Marketplace error:", err);

        setError(
          err instanceof Error
            ? err.message
            : "Something went wrong."
        );
      } finally {
        setLoading(false);
      }
    }

    fetchProducts();
  }, []);

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
          <h1 className="text-xl font-semibold text-ink">Marketplace</h1>
          <p className="text-xs text-ink-muted">
            Preloved favorites, ready for a new home
          </p>
        </div>
      </header>

      {loading ? (
        <p className="py-12 text-center text-sm text-ink-muted">
          Loading marketplace...
        </p>
      ) : error ? (
        <div className="rounded-2xl bg-red-50 p-4 text-center">
          <p className="text-sm text-red-600">{error}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-2 text-xs font-semibold text-primary"
          >
            Try again
          </button>
        </div>
      ) : products.length === 0 ? (
        <div className="rounded-2xl bg-mint-50 p-8 text-center">
          <h2 className="text-sm font-semibold text-ink">
            No products available yet
          </h2>
          <p className="mt-1 text-xs text-ink-muted">
            Check back later for new preloved finds.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {products.map((product, index) => (
            <ProductCard
              key={product.id}
              product={product}
              priority={index < 2}
            />
          ))}
        </div>
      )}
    </main>
  );
}
