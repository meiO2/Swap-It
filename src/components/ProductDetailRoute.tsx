"use client";

import { useParams } from "next/navigation";
import ProductDetail from "@/components/ProductDetail";

export default function ProductDetailRoute() {
  const { id } = useParams<{ id: string }>();
  return <ProductDetail id={id} />;
}
