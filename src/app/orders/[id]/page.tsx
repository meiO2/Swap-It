"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { ArrowLeft, BadgeCheck, Box, CalendarDays, CircleHelp, Copy, ExternalLink, MapPin, Truck } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import Countdown from "@/components/ui/Countdown";
import OrderStatusBadge from "@/components/orders/OrderStatusBadge";
import OrderTimeline from "@/components/orders/OrderTimeline";
import { catalogProducts } from "@/data/mock";
import { formatGP, formatRupiah } from "@/lib/format";
import { addDays, formatDateTime, formatOrderDate, type OrderShape } from "@/lib/orders";
import { apiRequest } from "@/lib/api";

export default function OrderDetailsPage() {
  return <Suspense fallback={<main className="min-h-dvh px-4 py-8 text-center text-sm text-ink-muted">Loading order details…</main>}><OrderDetailsContent /></Suspense>;
}

function OrderDetailsContent() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const id = params.id;
  const [order, setOrder] = useState<OrderShape | null>(null);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState(() => searchParams.get("placed") === "1" ? "Prototype order record created; no payment was collected." : "");
  const [helpOpen, setHelpOpen] = useState(false);
  const [error, setError] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [qcSaving, setQcSaving] = useState(false);
  const product = useMemo(() => order?.items[0] ? catalogProducts.find((item) => item.id === order.items[0].productId) : undefined, [order]);
  const latestEvent = order?.trackingEvents?.slice().sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
  useEffect(() => {
    let active = true;
    apiRequest<OrderShape>(`/api/orders/${encodeURIComponent(id)}`)
      .then((data) => { if (active) setOrder(data); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Could not load this order."); })
      .finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, [id]);

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

  async function cancelPendingOrder() {
    if (!order || cancelling) return;
    if (!window.confirm("Cancel this pending payment order and return the item to the marketplace?")) return;

    try {
      setCancelling(true);
      setError("");
      await apiRequest(`/api/orders/${encodeURIComponent(order.id)}/cancel`, {
        method: "POST",
      });
      setNotice("Order cancelled. The item is available in the marketplace again.");
      setOrder({ ...order, status: "CANCELLED" });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not cancel this order.");
    } finally {
      setCancelling(false);
    }
  }
  async function decideQc(productId: string, decision: "ACCEPT" | "REJECT") {
    if (!order || qcSaving) return;
    if (!window.confirm(decision === "REJECT" ? "Reject this product? You will receive 100% of the product value in Green Points." : "Accept this product and continue shipping without cashback?")) return;
    try { setQcSaving(true); setError(""); await apiRequest<{ qcStatus: string; refundAmount: number }>(`/api/orders/${encodeURIComponent(order.id)}/qc-decision`, { method: "POST", body: JSON.stringify({ productId, decision }) }); setNotice(decision === "REJECT" ? "Refund initiated. The full product value will be returned as Green Points." : "Your choice was recorded. The product will continue to shipping."); await apiRequest<OrderShape>(`/api/orders/${encodeURIComponent(id)}`).then(setOrder); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save your decision."); } finally { setQcSaving(false); }
  }

  if (!ready) return <main className="min-h-dvh px-4 py-8 text-center text-sm text-ink-muted">Loading order…</main>;
  if (!order) return <main className="min-h-dvh px-4 py-8"><h1 className="text-xl font-semibold text-ink">Order not found</h1><p className="mt-2 text-sm text-ink-muted">This order may have been removed or the link may be incorrect.</p><Link href="/orders" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-white"><ArrowLeft size={16} /> Back to orders</Link></main>;
  const viewOrder = order;
  const productValue = "subtotal" in viewOrder && typeof viewOrder.subtotal === "number"
    ? viewOrder.subtotal
    : viewOrder.productValue;
  const totalAmount = "totalAmount" in viewOrder && typeof viewOrder.totalAmount === "number"
    ? viewOrder.totalAmount
    : viewOrder.moneyPaid;
  const shippingFee = viewOrder.shippingFee ?? 0;
  const serviceFee = viewOrder.serviceFee ?? 0;
  const gpUsed = viewOrder.gpUsed ?? 0;
  const delivery = viewOrder.delivery;
  const routeDates = delivery?.courier ? formatOrderDate(viewOrder.estimatedArrival ?? addDays(new Date(viewOrder.createdAt), delivery.courier.maxDays).toISOString()) : null;
  const detailsTitle = product ? `${product.name} × ${viewOrder.items[0]?.quantity ?? 1}` : `${viewOrder.items.length} item${viewOrder.items.length === 1 ? "" : "s"}`;
  const qcRejected = viewOrder.qcStatus === "rejected" && viewOrder.status === "QC review";

  return (
    <main className="min-h-dvh space-y-4 px-4 pb-8 pt-5">
      <header className="flex items-center gap-3"><Link href="/orders" aria-label="Back to my orders" className="flex size-11 items-center justify-center rounded-full text-ink-muted hover:bg-mint-50"><ArrowLeft size={20} /></Link><div><h1 className="text-[26px] font-bold leading-tight text-ink">Order details</h1><p className="text-xs text-ink-muted">Order {viewOrder.id}</p></div><button type="button" onClick={() => void copyText(viewOrder.id, "Order ID")} aria-label="Copy order ID" className="ml-auto flex size-11 items-center justify-center rounded-full text-primary hover:bg-mint-50"><Copy size={18} /></button></header>
      {notice && <p role="status" aria-live="polite" className="rounded-2xl bg-success/10 p-3 text-sm font-semibold text-success">{notice}</p>}
      {error && <p role="alert" className="rounded-2xl bg-danger/10 p-3 text-xs text-danger">{error}</p>}
      {viewOrder.status === "PENDING_PAYMENT" && (
        <section className="rounded-3xl border border-warning/20 bg-warning/5 p-4">
          <h2 className="text-sm font-bold text-ink">Payment still pending</h2>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">
            Cancel this order if you do not want to continue. The item will be returned to the marketplace.
          </p>
          <button
            type="button"
            disabled={cancelling}
            onClick={() => void cancelPendingOrder()}
            className="mt-3 min-h-11 w-full rounded-full border border-danger px-4 text-xs font-semibold text-danger hover:bg-danger/5 disabled:opacity-60"
          >
            {cancelling ? "Cancelling..." : "Cancel order & return to marketplace"}
          </button>
        </section>
      )}

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
          <p className="mt-2 text-xs leading-relaxed text-ink">Quality check found that this item is not eligible.</p>
          <p className="mt-3 rounded-xl bg-warning/10 p-3 text-xs font-medium text-warning">Time remaining: <Countdown deadline={viewOrder.qcDecisionDeadline} /></p>
          <p className="mt-3 text-xs leading-relaxed text-ink-muted">Buyer keep/refund actions are not available: shipment and Green Point refund APIs are not implemented. No refund will be implied or recorded by this page.</p>
        </section>
      )}
      {viewOrder.items.some((item) => "qcStatus" in item && item.qcStatus === "FAILED_AWAITING_BUYER") && <section className="rounded-3xl border border-danger/20 bg-danger/5 p-4"><h2 className="text-sm font-bold text-danger">Official QC report: major damage found</h2><p className="mt-2 text-xs leading-relaxed text-ink-muted">Our quality team found that this item does not meet the listing quality standard. Review the item documentation above and choose within three days.</p><p className="mt-3 text-xs font-semibold text-ink">If rejected, the product value is returned to its original sources: GP as GP and cash to the original payment method. Shipping and service fees are handled separately.</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{viewOrder.items.filter((item) => "qcStatus" in item && item.qcStatus === "FAILED_AWAITING_BUYER").map((item) => <><button key={`${item.productId}-accept`} disabled={qcSaving} onClick={() => void decideQc(item.productId, "ACCEPT")} className="min-h-11 rounded-full border border-primary/40 text-xs font-semibold text-primary disabled:opacity-60">Accept product — continue shipping</button><button key={`${item.productId}-reject`} disabled={qcSaving} onClick={() => void decideQc(item.productId, "REJECT")} className="min-h-11 rounded-full bg-danger text-xs font-semibold text-white disabled:opacity-60">Reject — refund to original source</button></>)}</div></section>}

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
        <CourierDetails order={viewOrder} latest={latestEvent} onCopy={(value) => void copyText(value, "Tracking number")} onHelp={() => setHelpOpen(true)} />
      ) : (
        <section className="rounded-3xl bg-white p-4 text-sm text-ink-muted shadow-card">Delivery details are unavailable for this legacy order.</section>
      )}

      <section className="rounded-3xl bg-white p-4 shadow-card">
        <h2 className="text-base font-semibold text-ink">Payment summary</h2>
        <SummaryRow label="Product value" value={formatRupiah(productValue)} />
        <SummaryRow label="Green Points applied" value={formatGP(gpUsed)} positive />
        <SummaryRow label="Shipping / pickup" value={shippingFee > 0 ? formatRupiah(shippingFee) : "Free pickup"} />
        <SummaryRow label="Service fee" value={formatRupiah(serviceFee)} />
        <div className="my-3 border-t border-border" />
        <SummaryRow label="Total amount" value={formatRupiah(totalAmount)} strong />
        {delivery?.method === "courier" && delivery.address && <div className="mt-4 border-t border-border pt-3"><p className="text-xs font-semibold text-ink">Delivery address</p><p className="mt-1 text-xs text-ink-muted">{delivery.address.name} · {delivery.address.phone}</p><p className="mt-1 text-xs leading-relaxed text-ink-muted">{delivery.address.address}, {delivery.address.city} {delivery.address.postalCode}</p></div>}
      </section>

      {helpOpen && <HelpSheet onClose={() => setHelpOpen(false)} />}
    </main>
  );
}

function CourierDetails({ order, latest, onCopy, onHelp }: { order: OrderShape; latest?: OrderShape["trackingEvents"] extends (infer T)[] | undefined ? T : never; onCopy: (value: string) => void; onHelp: () => void }) {
  const delivery = order.delivery!;
  const history = (order.trackingEvents ?? []).slice().sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return (
    <section className="rounded-3xl bg-white p-4 shadow-card">
      <div className="flex items-start gap-3"><MapPin className="mt-0.5 text-primary" size={20} /><div><h2 className="text-base font-semibold text-ink">Courier tracking</h2><p className="mt-1 text-xs text-ink-muted">{latest ? `${latest.title} · ${latest.location}` : "Tracking information will update as the order moves."}</p></div></div>
      <p className="mt-3 rounded-2xl bg-mint-50 p-3 text-xs text-ink-muted">Live courier location is not available because no carrier tracking integration is configured.</p>
      <div className="mt-3 flex items-center gap-3 rounded-2xl bg-mint-50 p-3">
        <span className="flex size-9 items-center justify-center rounded-full bg-white text-primary"><Truck size={18} /></span>
        <div className="min-w-0 flex-1"><p className="text-[9px] text-ink-muted">Courier</p><p className="truncate text-xs font-semibold text-ink">{delivery.courier?.name ?? "Courier"}</p></div>
        <span className="h-8 w-px bg-border" />
        <div className="min-w-0 flex-1"><p className="text-[9px] text-ink-muted">Tracking number</p>{delivery.trackingNumber ? <button type="button" onClick={() => onCopy(delivery.trackingNumber!)} className="flex min-h-8 max-w-full items-center gap-1 text-xs font-semibold text-primary"><span className="truncate">{delivery.trackingNumber}</span><Copy size={12} /></button> : <p className="mt-1 text-xs text-ink-muted">Unavailable</p>}</div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={onHelp} className="col-span-2 flex min-h-11 items-center justify-center gap-1.5 rounded-full border border-primary/40 px-2 text-[11px] font-semibold text-primary"><CircleHelp size={14} /> Order help</button>
      </div>
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
        order.delivery?.pickupCode ? <div className="mt-3 flex flex-col items-center rounded-2xl bg-mint-50 p-4"><QRCodeSVG value={order.delivery.pickupCode} size={150} title="Pickup QR code for display only" /><p className="mt-2 text-xs font-bold tracking-wider text-ink">{order.delivery.pickupCode}</p><p className="mt-1 text-[10px] text-ink-muted">QR display only; no scanning validation is connected.</p></div> : <p role="alert" className="mt-3 rounded-xl bg-danger/10 p-3 text-xs text-danger">Pickup code unavailable; contact support before visiting the Hub.</p>
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
