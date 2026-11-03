"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, PackageSearch } from "lucide-react";
import OrderCard from "@/components/orders/OrderCard";
import { useSwapStore } from "@/store/useSwapStore";
import type { OrderShape } from "@/lib/orders";

const filters = ["All", "Processing", "Shipping / Ready", "Completed", "Cancelled"] as const;
type Filter = (typeof filters)[number];

function matchesFilter(order: OrderShape, filter: Filter) {
  if (filter === "All") return true;
  if (filter === "Processing") return order.status === "Processing" || order.status === "QC review";
  if (filter === "Shipping / Ready") return ["Shipped", "On the way", "Out for delivery", "Ready for pickup"].includes(order.status);
  if (filter === "Completed") return ["Delivered", "Picked up", "Completed"].includes(order.status);
  return order.status === "Cancelled" || order.status === "Not eligible";
}

export default function OrdersPage() {
  const orders = useSwapStore((state) => state.orders);
  const [filter, setFilter] = useState<Filter>("All");
  const filteredOrders = orders.filter((order) => matchesFilter(order, filter));

  return (
    <main className="min-h-dvh px-4 pb-8 pt-5">
      <header className="mb-5 flex items-center gap-3"><Link href="/profile" aria-label="Back to profile" className="flex size-11 items-center justify-center rounded-full text-ink-muted hover:bg-mint-50"><ArrowLeft size={20} /></Link><div><h1 className="text-xl font-semibold text-ink">My orders</h1><p className="text-xs text-ink-muted">Track purchases and pickups</p></div></header>
      <div role="tablist" aria-label="Filter orders" className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {filters.map((item) => <button key={item} type="button" role="tab" aria-selected={filter === item} onClick={() => setFilter(item)} className={`min-h-10 shrink-0 rounded-full px-4 text-xs font-semibold ${filter === item ? "bg-primary text-white" : "bg-white text-ink-muted shadow-card"}`}>{item}</button>)}
      </div>
      {filteredOrders.length ? (
        <div className="space-y-3">{filteredOrders.map((order) => <OrderCard key={order.id} order={order} />)}</div>
      ) : (
        <section className="rounded-3xl bg-white p-6 text-center shadow-card">
          <PackageSearch className="mx-auto text-primary" size={32} />
          <h2 className="mt-3 text-base font-semibold text-ink">No {filter === "All" ? "" : filter.toLowerCase()} orders yet</h2>
          <p className="mt-1 text-sm text-ink-muted">When you place an order, it will appear here.</p>
          <Link href="/products" className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-5 text-xs font-semibold text-white">Browse products</Link>
        </section>
      )}
    </main>
  );
}
