"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CircleAlert, ShieldCheck } from "lucide-react";
import Countdown from "@/components/ui/Countdown";
import { products } from "@/data/mock";
import { formatGP, formatRupiah } from "@/lib/format";
import { useSwapStore } from "@/store/useSwapStore";
import StatusBadge from "@/components/ui/StatusBadge";

export default function QcReport({ id }: { id: string }) {
  const router = useRouter();
  const order = useSwapStore((state) => state.orders.find((item) => item.id === id));
  const keepQcOrder = useSwapStore((state) => state.keepQcOrder);
  const rejectQcOrder = useSwapStore((state) => state.rejectQcOrder);
  const markSellerRetrieved = useSwapStore((state) => state.markSellerRetrieved);
  const processSellerNonRetrieval = useSwapStore((state) => state.processSellerNonRetrieval);
  const [expired, setExpired] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  const [sellerError, setSellerError] = useState("");
  const product = order?.items[0] ? products.find((item) => item.id === order.items[0].productId) : undefined;

  useEffect(() => {
    if (!order?.qcDecisionDeadline) return;
    const check = () => {
      const currentTime = Date.now();
      setNow(currentTime);
      if (Date.parse(order.qcDecisionDeadline!) <= currentTime && order.status === "QC review") {
        keepQcOrder(id);
        setExpired(true);
      }
      if (order.sellerRetrievalDeadline && Date.parse(order.sellerRetrievalDeadline) <= currentTime && !order.sellerOutcome) {
        try {
          processSellerNonRetrieval(id);
          setSellerError("");
        } catch (reason) {
          setSellerError(reason instanceof Error ? reason.message : "The seller outcome could not be processed.");
        }
      }
    };
    const timeoutId = window.setTimeout(check, 0);
    const intervalId = window.setInterval(check, 5000);
    return () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
    };
  }, [id, keepQcOrder, order?.qcDecisionDeadline, order?.sellerOutcome, order?.sellerRetrievalDeadline, order?.status, processSellerNonRetrieval]);

  if (!order || !product) {
    return <main className="px-4 py-8"><h1 className="text-lg font-semibold text-ink">QC report not found</h1><Link href="/orders" className="mt-3 inline-block text-sm text-primary">Back to orders</Link></main>;
  }

  const actionable = order.status === "QC review" && !expired;
  return (
    <main className="px-4 pb-6 pt-5">
      <header className="mb-5 flex items-center gap-3"><Link href="/orders" aria-label="Back to orders" className="rounded-full p-2 text-ink-muted hover:bg-mint-50"><ArrowLeft size={20} /></Link><div><h1 className="text-xl font-semibold text-ink">Official QC report</h1><p className="text-xs text-ink-muted">Order {order.id.slice(-6)}</p></div></header>
      <section className="rounded-2xl bg-danger/10 p-4">
        <div className="flex items-center gap-2 text-danger"><CircleAlert size={18} /><h2 className="text-sm font-semibold">Not eligible — major damage</h2></div>
        <p className="mt-2 text-xs leading-relaxed text-ink">Our quality team found a large tear at the side seam that was not disclosed in the listing.</p>
      </section>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="relative aspect-square overflow-hidden rounded-xl bg-mint-50"><Image src={product.image} alt="Product inspected by quality control" fill sizes="45vw" className="object-cover" /><span className="absolute bottom-2 left-2 rounded-full bg-white/90 px-2 py-1 text-[9px] font-medium text-ink">Item photo</span></div>
        <div className="relative aspect-square overflow-hidden rounded-xl bg-mint-50"><Image src="https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=720&q=85" alt="Close-up evidence photo of garment damage" fill sizes="45vw" className="object-cover" /><span className="absolute bottom-2 left-2 rounded-full bg-white/90 px-2 py-1 text-[9px] font-medium text-ink">Damage evidence</span></div>
      </div>
      <section className="mt-4 rounded-2xl bg-white p-4 shadow-card">
        <div className="flex items-center justify-between"><h2 className="text-sm font-semibold text-ink">Your decision</h2><StatusBadge status={order.status} /></div>
        {actionable && order.qcDecisionDeadline ? (
          <>
            <p className="mt-2 text-xs text-ink-muted">Choose within 3 days. If you do not choose in time, the item ships with no cashback.</p>
            <p className="mt-3 rounded-xl bg-warning/10 p-3 text-xs text-warning">Time remaining: <Countdown deadline={order.qcDecisionDeadline} /></p>
            <button type="button" onClick={() => { keepQcOrder(id); router.push("/orders"); }} className="mt-3 h-10 w-full rounded-full border border-border text-xs font-semibold text-ink hover:bg-mint-50">Keep product — ship with no cashback</button>
            <button type="button" onClick={() => { rejectQcOrder(id); router.push("/wallet"); }} className="mt-2 h-10 w-full rounded-full bg-danger text-xs font-semibold text-white hover:opacity-90">Reject product — refund 100% as GP</button>
            <p className="mt-2 text-[10px] text-ink-muted">Refund: {formatGP(order.productValue)} ({formatRupiah(order.productValue)}) to your wallet. Shipping and service fees are handled separately.</p>
          </>
        ) : (
          <p className="mt-2 text-xs text-ink-muted">{expired ? "The decision window ended. The product will ship with no cashback." : "This QC decision has already been recorded."}</p>
        )}
      </section>
      <section className="mt-4 rounded-2xl bg-mint-50 p-4">
        <p className="flex items-center gap-2 text-xs font-semibold text-primary"><ShieldCheck size={15} /> Seller retrieval policy</p>
        <p className="mt-2 text-xs leading-relaxed text-ink-muted">The seller has 2 weeks to retrieve the item. If it is not retrieved by <Countdown deadline={order.sellerRetrievalDeadline ?? "2026-11-10T15:52:00.000Z"} />, the seller receives 40% of the listing price as GP and the piece goes to Revamp!.</p>
        {order.sellerOutcome === "Retrieved" && <p className="mt-2 text-xs font-medium text-success">Seller retrieved the item within the allowed time.</p>}
        {order.sellerOutcome === "Revamp" && <p className="mt-2 text-xs font-medium text-primary">{formatGP(Math.floor(order.productValue * 0.4))} added to seller wallet; item moved to Revamp!.</p>}
        {!order.sellerOutcome && now !== null && Date.parse(order.sellerRetrievalDeadline ?? "2026-11-10T15:52:00.000Z") > now && (
          <button type="button" onClick={() => {
            try {
              markSellerRetrieved(id);
              setSellerError("");
            } catch (reason) {
              setSellerError(reason instanceof Error ? reason.message : "The retrieval could not be recorded.");
            }
          }} className="mt-3 rounded-full border border-primary/30 px-3 py-2 text-[10px] font-semibold text-primary hover:bg-white">Seller: mark item retrieved</button>
        )}
        {!order.sellerOutcome && now !== null && Date.parse(order.sellerRetrievalDeadline ?? "2026-11-10T15:52:00.000Z") <= now && (
          <button type="button" onClick={() => {
            try {
              processSellerNonRetrieval(id);
              setSellerError("");
            } catch (reason) {
              setSellerError(reason instanceof Error ? reason.message : "The seller outcome could not be processed.");
            }
          }} className="mt-3 rounded-full bg-primary px-3 py-2 text-[10px] font-semibold text-white">Process 40% GP and move to Revamp!</button>
        )}
        {sellerError && <p role="alert" className="mt-2 text-[10px] text-danger">{sellerError}</p>}
        <Link href="/revamp" className="mt-2 inline-block text-xs font-semibold text-primary">About Revamp! →</Link>
      </section>
    </main>
  );
}
