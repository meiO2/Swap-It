
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ImageIcon,
  Package,
  Plus,
} from "lucide-react";

import { apiRequest } from "@/lib/api";
import { formatRupiah, formatShortDate } from "@/lib/format";

type ProductStatus =
  | "AVAILABLE"
  | "RESERVED"
  | "SOLD"
  | "INACTIVE"
  | "REVAMP_ELIGIBLE"
  | "REVAMPED";

type SellerProduct = {
  _id: string;
  name: string;
  description: string;
  category: string;
  brand?: string;
  price: number;
  size: string;
  condition: "NEW" | "LIKE_NEW" | "GOOD" | "FAIR";
  images: string[];
  fulfillment: "Swap Hub drop-off" | "Pickup";
  pickupDate?: string;
  pickupAddress?: {
    name: string;
    address: string;
    city: string;
    postalCode: string;
  };
  pickupChanges: number;
  status: ProductStatus;
  publishedAt: string | null;
  createdAt?: string;
};

const STATUS_CONFIG: Record<
  ProductStatus,
  { label: string; style: string }
> = {
  AVAILABLE: {
    label: "Available",
    style: "bg-success/15 text-success",
  },
  RESERVED: {
    label: "Reserved",
    style: "bg-warning/15 text-warning",
  },
  SOLD: {
    label: "Sold",
    style: "bg-info/15 text-info",
  },
  INACTIVE: {
    label: "Inactive",
    style: "bg-ink-muted/15 text-ink-muted",
  },
  REVAMP_ELIGIBLE: {
    label: "Revamp eligible",
    style: "bg-warning/15 text-warning",
  },
  REVAMPED: {
    label: "Revamped",
    style: "bg-success/15 text-success",
  },
};

const CONDITION_LABELS: Record<
  SellerProduct["condition"],
  string
> = {
  NEW: "New",
  LIKE_NEW: "Like new",
  GOOD: "Very good",
  FAIR: "Good",
};

export default function ListingsPage() {
  const [products, setProducts] = useState<SellerProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    apiRequest<SellerProduct[]>("/api/products?mine=true&limit=50")
      .then((data) => {
        if (active) {
          setProducts(data);
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load your products.",
          );
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="px-4 pb-6 pt-5">
      <header className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/profile"
            aria-label="Back to profile"
            className="rounded-full p-2 text-ink-muted hover:bg-mint-50"
          >
            <ArrowLeft size={20} />
          </Link>

          <div>
            <h1 className="text-xl font-semibold text-ink">
              My listings
            </h1>
            <p className="text-xs text-ink-muted">
              Manage your products and their status
            </p>
          </div>
        </div>

        <Link
          href="/sell"
          aria-label="Create listing"
          className="flex size-10 items-center justify-center rounded-full bg-mint-200 text-primary"
        >
          <Plus size={20} />
        </Link>
      </header>

      {error && (
        <p
          role="alert"
          className="mb-3 rounded-xl bg-danger/10 p-3 text-xs text-danger"
        >
          {error}
        </p>
      )}

      {loading ? (
        <p
          role="status"
          className="rounded-2xl bg-white p-5 text-sm text-ink-muted"
        >
          Loading your products...
        </p>
      ) : products.length === 0 ? (
        <section className="rounded-2xl bg-mint-50 p-5 text-center">
          <Package
            size={32}
            className="mx-auto text-primary"
          />

          <p className="mt-3 text-sm text-ink-muted">
            You haven&apos;t published any products yet.
          </p>

          <Link
            href="/sell"
            className="mt-3 inline-block text-xs font-semibold text-primary"
          >
            Create your first listing
          </Link>
        </section>
      ) : (
        <div className="space-y-3">
          {products.map((product) => (
            <ProductCard
              key={product._id}
              product={product}
            />
          ))}
        </div>
      )}

      <section className="mt-4 rounded-2xl bg-mint-50 p-4">
        <h2 className="text-sm font-semibold text-ink">
          Product management
        </h2>

        <p className="mt-1 text-xs leading-relaxed text-ink-muted">
          Your products are managed through SwapIt&apos;s marketplace.
          When a product is purchased, its handover schedule can be
          managed separately through Seller Center.
        </p>

        <Link
          href="/seller/handover"
          className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-primary"
        >
          <Package size={14} />
          Go to handover scheduling
        </Link>
      </section>
    </main>
  );
}

function ProductCard({
  product,
}: {
  product: SellerProduct;
}) {
  const status = STATUS_CONFIG[product.status];

  return (
      <Link
        href={`/products/${product._id}`}
        className="block rounded-2xl bg-white p-4 shadow-card transition hover:shadow-md"
      >
      <div className="flex gap-3">
        <div className="size-24 shrink-0 overflow-hidden rounded-xl bg-mint-50">
          {product.images?.[0] ? (
            <img
              src={product.images[0]}
              alt={product.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-primary">
              <ImageIcon size={28} />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${status.style}`}
            >
              {status.label}
            </span>
          </div>

          <h2 className="text-sm font-semibold text-ink">
            {product.name}
          </h2>

          <p className="mt-1 text-xs text-ink-muted">
            {product.category} · Size {product.size}
          </p>

          <p className="mt-1 text-xs text-ink-muted">
            {CONDITION_LABELS[product.condition] ??
              product.condition}
          </p>

          <p className="mt-2 text-sm font-semibold text-primary">
            {formatRupiah(product.price)}
          </p>
        </div>
      </div>

      <div className="mt-3 rounded-xl bg-mint-50 p-3 text-xs">
        <p className="font-medium text-ink">
          {product.fulfillment}
        </p>

        {product.fulfillment === "Pickup" &&
          product.pickupAddress && (
            <p className="mt-1 text-ink-muted">
              Pickup from {product.pickupAddress.name}:{" "}
              {product.pickupAddress.address},{" "}
              {product.pickupAddress.city}{" "}
              {product.pickupAddress.postalCode}
            </p>
          )}

        {product.fulfillment === "Pickup" &&
          product.pickupDate && (
            <p className="mt-1 text-ink-muted">
              Preferred pickup date:{" "}
              {formatShortDate(product.pickupDate)}
            </p>
          )}

        <p className="mt-2 text-[10px] text-ink-muted">
          Published:{" "}
          {product.publishedAt
            ? formatShortDate(product.publishedAt)
            : "Not published"}
        </p>
      </div>
    </Link>
  );
}
