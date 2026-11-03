"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, BadgeCheck, Box, CalendarDays, CircleHelp, Copy, ExternalLink, MapPin, Phone, RotateCcw, Truck } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import Countdown from "@/components/ui/Countdown";
import OrderStatusBadge from "@/components/orders/OrderStatusBadge";
import OrderTimeline from "@/components/orders/OrderTimeline";
import { catalogProducts } from "@/data/mock";
import { formatGP, formatRupiah } from "@/lib/format";
import { addDays, formatDateTime, formatOrderDate, SHOW_DEMO_CONTROLS, type OrderShape } from "@/lib/orders";
import { useSwapStore } from "@/store/useSwapStore";

export default function OrderDetailsPage() {
  return <Suspense fallback={<main className="min-h-dvh px-4 py-8 text-center text-sm text-ink-muted">Loading order details…</main>}><OrderDetailsContent /></Suspense>;
}

function OrderDetailsContent() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const order = useSwapStore((state) => state.orders.find((item) => item.id === id));
  const advanceOrder = useSwapStore((state) => state.advanceOrder);
  const resetOrderDemo = useSwapStore((state) => state.resetOrderDemo);
  const approveOrderQc = useSwapStore((state) => state.approveOrderQc);
  const rejectOrderQc = useSwapStore((state) => state.rejectOrderQc);
  const keepQcOrder = useSwapStore((state) => state.keepQcOrder);
  const refundQcOrder = useSwapStore((state) => state.rejectQcOrder);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const [error, setError] = useState("");
  const product = useMemo(() => order?.items[0] ? catalogProducts.find((item) => item.id === order.items[0].productId) : undefined, [order]);
  const latestEvent = order?.trackingEvents?.slice().sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
  const canAdvance = Boolean(order && (
    (order.qcStatus === "passed" && ["Shipped", "On the way", "Out for delivery", "Ready for pickup"].includes(order.status))
    || order.status === "Processing" && order.qcStatus === "pending"
  ));

  useEffect(() => {
    let active = true;
    void Promise.resolve(useSwapStore.persist.rehydrate()).then(() => { if (active) setReady(true); }, (reason: unknown) => {
      console.error("Could not restore saved orders.", reason);
      if (active) {
        setError(reason instanceof Error ? reason.message : "Saved order data could not be restored.");
        setReady(true);
      }
    });
    const noticeTimer = window.setTimeout(() => {
      if (new URLSearchParams(window.location.search).get("placed") === "1") {
        setNotice("Order placed");
        window.setTimeout(() => setNotice(""), 3500);
      }
    }, 0);
    return () => { active = false; window.clearTimeout(noticeTimer); };
  }, []);

  async function copyText(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(`${label} copied`);
      window.setTimeout(() => setNotice(""), 2500);
      setError("");
    } catch (reason) {
      console.error(`Could not copy ${label.toLowerCase()}.`, reason);
      setError(`Could not copy ${label.toLowerCase()}. Please select and copy it manually.`);
    }
  }

  function runAdvance() {
    try {
      advanceOrder(id);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The order status could not be advanced.");
    }
  }

  if (!ready) return <main className="min-h-dvh px-4 py-8 text-center text-sm text-ink-muted">Loading order…</main>;
  if (!order) return <main className="min-h-dvh px-4 py-8"><h1 className="text-xl font-semibold text-ink">Order not found</h1><p className="mt-2 text-sm text-ink-muted">This order may have been removed or the link may be incorrect.</p><Link href="/orders" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-white"><ArrowLeft size={16} /> Back to orders</Link></main>;
  const viewOrder = order as OrderShape;
  const delivery = viewOrder.delivery;
  const routeDates = delivery?.courier ? formatOrderDate(viewOrder.estimatedArrival ?? addDays(new Date(viewOrder.createdAt), delivery.courier.maxDays).toISOString()) : null;
  const detailsTitle = product ? `${product.name} × ${viewOrder.items[0]?.quantity ?? 1}` : `${viewOrder.items.length} item${viewOrder.items.length === 1 ? "" : "s"}`;
  const qcRejected = viewOrder.qcStatus === "rejected" && viewOrder.status === "QC review";
  const isComplete = ["Delivered", "Picked up", "Completed"].includes(viewOrder.status);

  return (
    <main className="min-h-dvh space-y-4 px-4 pb-8 pt-5">
      <header className="flex items-center gap-3"><Link href="/orders" aria-label="Back to my orders" className="flex size-11 items-center justify-center rounded-full text-ink-muted hover:bg-mint-50"><ArrowLeft size={20} /></Link><div><h1 className="text-[26px] font-bold leading-tight text-ink">Order details</h1><p className="text-xs text-ink-muted">Order {viewOrder.id}</p></div><button type="button" onClick={() => void copyText(viewOrder.id, "Order ID")} aria-label="Copy order ID" className="ml-auto flex size-11 items-center justify-center rounded-full text-primary hover:bg-mint-50"><Copy size={18} /></button></header>
      {notice && <p role="status" aria-live="polite" className="rounded-2xl bg-success/10 p-3 text-sm font-semibold text-success">{notice}</p>}
      {error && <p role="alert" className="rounded-2xl bg-danger/10 p-3 text-xs text-danger">{error}</p>}

      <section className="rounded-3xl bg-white p-4 shadow-card">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0"><p className="text-xs text-ink-muted">Order {viewOrder.id}</p><h2 className="mt-1 text-base font-bold text-ink">{detailsTitle}</h2><p className="mt-1 text-xs text-ink-muted">{formatOrderDate(viewOrder.createdAt)}</p></div>
          <OrderStatusBadge order={viewOrder} />
        </div>
        <div className="relative mt-3 h-24 w-24 overflow-hidden rounded-2xl bg-mint-50">
          {product ? <Image src={product.image} alt={product.imageAlt} fill sizes="96px" className="object-cover" /> : <Box className="absolute inset-0 m-auto text-primary" />}
        </div>
      </section>

      {qcRejected && viewOrder.qcDecisionDeadline && (
        <section className="rounded-3xl border border-danger/15 bg-danger/5 p-4">
          <h2 className="flex items-center gap-2 text-sm font-bold text-danger"><BadgeCheck size={18} /> Action needed</h2>
          <p className="mt-2 text-xs leading-relaxed text-ink">Quality check found that this item is not eligible. Choose what to do within 3 days.</p>
          <p className="mt-3 rounded-xl bg-warning/10 p-3 text-xs font-medium text-warning">Time remaining: <Countdown deadline={viewOrder.qcDecisionDeadline} /></p>
          <button type="button" onClick={() => { keepQcOrder(id); setError(""); setNotice("You chose to keep the product."); }} className="mt-3 min-h-11 w-full rounded-full border border-primary px-4 text-xs font-semibold text-primary">Keep product — ship with no reward</button>
          <button type="button" onClick={() => { refundQcOrder(id); setError(""); setNotice("Product value refunded as Green Points."); }} className="mt-2 min-h-11 w-full rounded-full bg-danger px-4 text-xs font-semibold text-white">Reject product — refund 100% as GP</button>
          <p className="mt-2 text-[10px] text-ink-muted">Refund: {formatGP(viewOrder.productValue)} ({formatRupiah(viewOrder.productValue)}). Delivery and service fees are handled separately.</p>
        </section>
      )}

      <section className="rounded-3xl bg-white p-3 shadow-card">
        <OrderTimeline order={viewOrder} />
      </section>

      <section className="flex items-center gap-3 rounded-3xl bg-mint-50 p-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white text-primary"><CalendarDays size={20} /></span>
        <div className="min-w-0 flex-1"><p className="text-xs text-ink-muted">{delivery?.method === "pickup" ? "Ready for pickup by" : "Estimated arrival"}</p><p className="mt-1 text-base font-bold text-ink">{delivery?.method === "pickup" ? formatOrderDate(viewOrder.pickupDeadline ?? addDays(new Date(viewOrder.createdAt), 7).toISOString()) : routeDates ?? "Arrival estimate unavailable"}</p></div>
        <span aria-hidden="true" className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">{delivery?.method === "pickup" ? <Box size={28} /> : <Truck size={30} />}</span>
      </section>

      {delivery?.method === "pickup" ? (
        <PickupDetails order={viewOrder} onHelp={() => setHelpOpen(true)} />
      ) : delivery?.method === "courier" ? (
        <CourierDetails order={viewOrder} latest={latestEvent} progress={viewOrder.progress ?? 0} onCopy={(value) => void copyText(value, "Tracking number")} onHelp={() => setHelpOpen(true)} />
      ) : (
        <section className="rounded-3xl bg-white p-4 text-sm text-ink-muted shadow-card">Delivery details are unavailable for this legacy order.</section>
      )}

      <section className="rounded-3xl bg-white p-4 shadow-card">
        <h2 className="text-base font-semibold text-ink">Payment summary</h2>
        <SummaryRow label="Product value" value={formatRupiah(viewOrder.productValue)} />
        <SummaryRow label="Green Points applied" value={`−${formatGP(viewOrder.gpUsed)}`} positive />
        <SummaryRow label="Shipping / pickup" value={viewOrder.shippingFee > 0 ? formatRupiah(viewOrder.shippingFee) : "Free pickup"} />
        <SummaryRow label="Service fee" value={formatRupiah(viewOrder.serviceFee)} />
        <div className="my-3 border-t border-border" />
        <SummaryRow label="Paid in money" value={formatRupiah(viewOrder.moneyPaid)} strong />
        {viewOrder.rewardEligible === false ? <p className="mt-3 text-xs text-ink-muted">No purchase reward applies to this QC outcome.</p> : isComplete && viewOrder.rewardGranted ? <p className="mt-3 rounded-xl bg-success/10 p-3 text-xs font-semibold text-success">Completed reward earned: {formatGP(Math.floor(viewOrder.productValue * 0.02))}</p> : <p className="mt-3 rounded-xl bg-mint-50 p-3 text-xs font-medium text-primary">You&apos;ll earn {formatGP(Math.floor(viewOrder.productValue * 0.02))} after the order is completed.</p>}
        {delivery?.method === "courier" && delivery.address && <div className="mt-4 border-t border-border pt-3"><p className="text-xs font-semibold text-ink">Delivery address</p><p className="mt-1 text-xs text-ink-muted">{delivery.address.name} · {delivery.address.phone}</p><p className="mt-1 text-xs leading-relaxed text-ink-muted">{delivery.address.address}, {delivery.address.city} {delivery.address.postalCode}</p></div>}
      </section>

      {SHOW_DEMO_CONTROLS && (
        <section className="rounded-3xl border border-warning/20 bg-white p-4 shadow-card">
          <p className="text-xs font-semibold text-warning">Prototype controls</p>
          {viewOrder.qcStatus === "pending" && viewOrder.status === "Processing" ? (
            <>
              <p className="mt-1 text-xs text-ink-muted">Waiting for the admin quality check. Approving moves the order to delivery; rejecting starts the 3-day decision window.</p>
              <button type="button" onClick={() => { approveOrderQc(id); setNotice("Quality check approved."); }} className="mt-3 min-h-11 w-full rounded-full bg-primary text-xs font-semibold text-white">Admin demo: approve item</button>
              <button type="button" onClick={() => { rejectOrderQc(id); setNotice("Quality check rejected. Buyer action is required."); }} className="mt-2 min-h-11 w-full rounded-full border border-danger/30 text-xs font-semibold text-danger">Admin demo: reject item</button>
            </>
          ) : (
            <>
              <p className="mt-1 text-xs text-ink-muted">Use the demo control to move the parcel or pickup to its next status.</p>
              <button type="button" disabled={!canAdvance || isComplete || viewOrder.status === "Cancelled" || qcRejected} onClick={runAdvance} className="mt-3 min-h-11 w-full rounded-full bg-primary text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45">Advance status</button>
              {isComplete || viewOrder.rewardGranted ? <p className="mt-2 text-[10px] text-ink-muted">Reset is unavailable after an order is completed.</p> : <button type="button" onClick={() => { resetOrderDemo(id); setNotice("Demo order reset to quality check."); }} className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-border text-xs font-semibold text-ink-muted"><RotateCcw size={14} /> Reset</button>}
              <Link href="/admin" className="mt-3 inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-primary">Open order QC admin <ExternalLink size={13} /></Link>
            </>
          )}
        </section>
      )}
      {helpOpen && <HelpSheet onClose={() => setHelpOpen(false)} />}
    </main>
  );
}

function CourierDetails({ order, latest, progress, onCopy, onHelp }: { order: OrderShape; latest?: OrderShape["trackingEvents"] extends (infer T)[] | undefined ? T : never; progress: number; onCopy: (value: string) => void; onHelp: () => void }) {
  const delivery = order.delivery!;
  const [demoMessage, setDemoMessage] = useState("");
  const x = 25 + Math.max(0, Math.min(1, progress)) * 250;
  const y = 73 - Math.sin(Math.max(0, Math.min(1, progress)) * Math.PI) * 34;
  const history = (order.trackingEvents ?? []).slice().sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return (
    <section className="rounded-3xl bg-white p-4 shadow-card">
      <div className="flex items-start gap-3"><MapPin className="mt-0.5 text-primary" size={20} /><div><h2 className="text-base font-semibold text-ink">Courier tracking</h2><p className="mt-1 text-xs text-ink-muted">{latest ? `${latest.title} · ${latest.location}` : "Tracking information will update as the order moves."}</p></div></div>
      <div className="mt-3 overflow-hidden rounded-2xl bg-mint-50">
        <svg viewBox="0 0 300 110" role="img" aria-label={`Stylized courier route map, ${Math.round(progress * 100)} percent complete`} className="h-[110px] w-full">
          <rect width="300" height="110" fill="currentColor" className="text-mint-50" />
          <path d="M0 25H300M0 90H300M60 0V110M215 0V110" stroke="currentColor" strokeWidth="2" className="text-white" />
          <path d="M20 78 C60 75 62 32 105 44 S152 87 188 63 S235 20 280 35" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" className="text-primary/35" />
          <path d={`M20 78 C60 75 62 32 105 44 S152 87 188 63 S235 20 280 35`} fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeDasharray="400" strokeDashoffset={400 * (1 - progress)} className="text-primary" />
          <circle cx="20" cy="78" r="7" fill="currentColor" className="text-success" /><circle cx="280" cy="35" r="8" fill="currentColor" className="text-primary" />
          <g transform={`translate(${x} ${y})`}><circle r="13" fill="currentColor" className="text-white" /><circle r="10" fill="currentColor" className="text-primary" /><path d="M-5 2h10V-2H2L0-5h-5z" fill="white" /></g>
        </svg>
      </div>
      <div className="mt-3 flex items-center gap-3 rounded-2xl bg-mint-50 p-3">
        <span className="flex size-9 items-center justify-center rounded-full bg-white text-primary"><Truck size={18} /></span>
        <div className="min-w-0 flex-1"><p className="text-[9px] text-ink-muted">Courier</p><p className="truncate text-xs font-semibold text-ink">{delivery.courier?.name ?? "Courier"}</p></div>
        <span className="h-8 w-px bg-border" />
        <div className="min-w-0 flex-1"><p className="text-[9px] text-ink-muted">Tracking number</p><button type="button" onClick={() => delivery.trackingNumber && onCopy(delivery.trackingNumber)} className="flex min-h-8 max-w-full items-center gap-1 text-xs font-semibold text-primary"><span className="truncate">{delivery.trackingNumber ?? "Pending"}</span><Copy size={12} /></button></div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => { setDemoMessage("Demo only — courier contact is not connected."); window.setTimeout(() => setDemoMessage(""), 3000); }} className="flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-primary px-2 text-[11px] font-semibold text-white"><Phone size={14} /> Contact courier</button>
        <button type="button" onClick={onHelp} className="flex min-h-11 items-center justify-center gap-1.5 rounded-full border border-primary/40 px-2 text-[11px] font-semibold text-primary"><CircleHelp size={14} /> Order help</button>
      </div>
      {demoMessage && <p role="status" className="mt-2 text-center text-xs text-ink-muted">{demoMessage}</p>}
      <details className="mt-3 rounded-xl bg-mint-50 px-3">
        <summary className="flex min-h-11 cursor-pointer items-center text-xs font-semibold text-primary">View full tracking history</summary>
        <ol className="space-y-3 pb-3">
          {history.length ? history.map((event) => <li key={event.id} className="border-l-2 border-primary/30 pl-3"><p className="text-xs font-semibold text-ink">{event.title}</p><p className="mt-0.5 text-[10px] text-ink-muted">{formatDateTime(event.at)} · {event.location}</p></li>) : <li className="pb-2 text-xs text-ink-muted">Tracking history will appear here.</li>}
        </ol>
      </details>
    </section>
  );
}

function PickupDetails({ order, onHelp }: { order: OrderShape; onHelp: () => void }) {
  const hub = order.delivery?.hub;
  const readyForPickup = order.status === "Ready for pickup";
  const mapQuery = encodeURIComponent(`${hub?.name ?? "Swap Hub"} ${hub?.address ?? ""}`);
  return (
    <section className="rounded-3xl bg-white p-4 shadow-card">
      <div className="flex items-start gap-3"><MapPin className="mt-0.5 text-primary" size={20} /><div><h2 className="text-base font-semibold text-ink">Pickup at Swap Hub</h2><p className="mt-1 text-sm font-semibold text-primary">{hub?.name ?? "Swap Hub"}</p><p className="mt-1 text-xs text-ink-muted">{hub?.address}</p><p className="mt-1 text-xs text-ink-muted">{hub?.openingHours}</p></div></div>
      {readyForPickup ? (
        <div className="mt-3 flex flex-col items-center rounded-2xl bg-mint-50 p-4"><QRCodeSVG value={order.delivery?.pickupCode ?? `SWP-PICK-${order.id}`} size={150} title="Pickup QR code for display only" /><p className="mt-2 text-xs font-bold tracking-wider text-ink">{order.delivery?.pickupCode ?? `SWP-PICK-${order.id}`}</p><p className="mt-1 text-[10px] text-ink-muted">Show this code at the Hub. This QR is display-only.</p></div>
      ) : <p className="mt-3 rounded-2xl bg-mint-50 p-4 text-xs leading-relaxed text-ink-muted">Your QR code will appear when your order is ready.</p>}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <a href={`https://www.google.com/maps/search/?api=1&query=${mapQuery}`} target="_blank" rel="noreferrer" className="flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-primary px-2 text-[11px] font-semibold text-white">Get directions <ExternalLink size={13} /></a>
        <button type="button" onClick={onHelp} className="flex min-h-11 items-center justify-center gap-1.5 rounded-full border border-primary/40 px-2 text-[11px] font-semibold text-primary"><CircleHelp size={14} /> Order help</button>
      </div>
    </section>
  );
}

function SummaryRow({ label, value, positive = false, strong = false }: { label: string; value: string; positive?: boolean; strong?: boolean }) {
  return <div className={`mt-2 flex justify-between gap-3 text-xs ${strong ? "font-bold text-ink" : positive ? "text-primary" : "text-ink-muted"}`}><span>{label}</span><span className="text-right">{value}</span></div>;
}

function HelpSheet({ onClose }: { onClose: () => void }) {
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-overlay/45 p-0" role="presentation" onClick={onClose}><section role="dialog" aria-modal="true" aria-labelledby="order-help-title" onClick={(event) => event.stopPropagation()} className="w-full max-w-[430px] rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"><h2 id="order-help-title" className="text-lg font-semibold text-ink">Order help</h2><p className="mt-2 text-sm leading-relaxed text-ink-muted">This prototype does not connect to live support. Your order details and tracking information are available on this page.</p><button type="button" onClick={onClose} className="mt-4 min-h-11 w-full rounded-full bg-primary text-sm font-semibold text-white">Got it</button></section></div>;
}
