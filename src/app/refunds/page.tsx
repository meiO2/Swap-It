"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";

type Refund = { id: string; orderId: string; reason: string; description: string; status: string; totalApprovedAmount?: number };

export default function RefundsPage() {
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [error, setError] = useState("");
  useEffect(() => { void apiRequest<Refund[]>("/api/refunds").then(setRefunds).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load compensation history.")); }, []);
  return <main className="mx-auto min-h-dvh max-w-xl space-y-5 px-4 py-6"><header><Link href="/orders" className="text-sm font-semibold text-primary">← My orders</Link><h1 className="mt-3 text-2xl font-bold text-ink">Compensation history</h1><p className="mt-1 text-sm text-ink-muted">SwapIt inspects eligible items before delivery. When major damage is found, the official QC report in your order lets you accept delivery or reject it for Green Point compensation.</p></header>{error && <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p>}<section className="space-y-3">{refunds.length ? refunds.map((item) => <article key={item.id} className="rounded-2xl bg-white p-4 shadow-card"><div className="flex justify-between gap-3"><p className="font-semibold text-ink">{item.reason.replaceAll("_", " ")}</p><span className="rounded-full bg-mint-50 px-2 py-1 text-[10px] font-bold text-primary">{item.status}</span></div><p className="mt-1 text-xs text-ink-muted">Order {item.orderId}</p><p className="mt-2 text-sm text-ink-muted">{item.description}</p>{item.totalApprovedAmount !== undefined && <p className="mt-2 text-xs font-semibold text-ink">Compensation: {item.totalApprovedAmount.toLocaleString("id-ID")} GP</p>}</article>) : <p className="rounded-2xl bg-white p-4 text-sm text-ink-muted">No compensation records yet.</p>}</section></main>;
}
