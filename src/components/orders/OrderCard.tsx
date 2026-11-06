"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, PackageCheck } from "lucide-react";
import { catalogProducts } from "@/data/mock";
import { formatRupiah } from "@/lib/format";
import { formatOrderDate, getOrderStatusLabel, type OrderShape } from "@/lib/orders";
import OrderStatusBadge from "@/components/orders/OrderStatusBadge";

export default function OrderCard({ order }: { order: OrderShape }) {
  const firstItem = order.items[0];
  const product = catalogProducts.find((item) => item.id === firstItem?.productId);
  const deliveryLabel = order.deliveryMethod === "pickup" || order.delivery?.method === "pickup"
    ? `Pickup at ${order.delivery?.hub?.name ?? "Swap Hub"}`
    : "Courier";
  const orderTotal = order.totalAmount ?? order.moneyPaid ?? order.subtotal ?? 0;
  return (
    <Link href={`/orders/${order.id}`} className="block rounded-3xl bg-white p-4 shadow-card transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
      <div className="flex items-start gap-3">
        <div className="relative size-[68px] shrink-0 overflow-hidden rounded-xl bg-mint-50">
          {product ? <Image src={product.image} alt={product.imageAlt} fill sizes="68px" className="object-cover" /> : <PackageCheck className="absolute inset-0 m-auto text-primary" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2"><h2 className="line-clamp-2 text-sm font-semibold text-ink">{product?.name ?? "Marketplace item"} × {firstItem?.quantity ?? 1}</h2><OrderStatusBadge order={order} /></div>
          <p className="mt-1 text-[10px] text-ink-muted">Order {order.id} · {formatOrderDate(order.createdAt)}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-mint-50 p-3 text-xs">
        <span className="min-w-0 truncate text-ink-muted">{deliveryLabel}</span>
        <span className="shrink-0 font-semibold text-ink">{formatRupiah(orderTotal)}</span>
      </div>
      <div className="mt-3 flex items-center justify-between text-xs font-semibold text-primary"><span>{getOrderStatusLabel(order) === "Action needed" ? "Review QC decision" : "Track order"}</span><ArrowRight size={15} /></div>
    </Link>
  );
}
