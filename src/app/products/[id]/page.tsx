import { Suspense } from "react";
import ProductDetailRoute from "@/components/ProductDetailRoute";

export default function ProductPage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm text-ink-muted">Loading listing…</div>}>
      <ProductDetailRoute />
    </Suspense>
  );
}
