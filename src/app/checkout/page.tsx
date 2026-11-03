"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, BadgeCheck, Check, ChevronRight, MapPin, Package, Truck, X } from "lucide-react";
import { catalogProducts, swapHubs } from "@/data/mock";
import { couriers, type Courier } from "@/data/couriers";
import { savedAddresses, type SavedAddress } from "@/data/addresses";
import { estimateArrival, formatOrderDate, generatePickupCode, generateTrackingNumber } from "@/lib/orders";
import { formatGP, formatRupiah } from "@/lib/format";
import { useSwapStore } from "@/store/useSwapStore";

const serviceFee = 5000;

export default function CheckoutPage() {
  const router = useRouter();
  const cart = useSwapStore((state) => state.cart);
  const balance = useSwapStore((state) => state.pointBatches.reduce((total, batch) => total + batch.remaining, 0));
  const checkout = useSwapStore((state) => state.checkout);
  const [gpPercent, setGpPercent] = useState(0);
  const [method, setMethod] = useState<"courier" | "pickup">("courier");
  const [courierId, setCourierId] = useState(couriers[0].id);
  const [address, setAddress] = useState<SavedAddress>(savedAddresses[0]);
  const [hubId, setHubId] = useState(swapHubs[0].id);
  const [addressSheetOpen, setAddressSheetOpen] = useState(false);
  const [addingAddress, setAddingAddress] = useState(false);
  const [newAddress, setNewAddress] = useState({ name: "", phone: "", address: "", city: "", postalCode: "" });
  const [addressError, setAddressError] = useState("");
  const [error, setError] = useState("");
  const [etaStart, setEtaStart] = useState<string | null>(null);
  const entries = useMemo(() => cart.map((item) => ({ item, product: catalogProducts.find((product) => product.id === item.productId) })).filter((entry) => entry.product), [cart]);
  const productValue = entries.reduce((sum, entry) => sum + entry.product!.price * entry.item.quantity, 0);
  const maxPercent = productValue ? Math.min(100, Math.floor((balance / productValue) * 100)) : 0;
  const gpUsed = Math.floor(productValue * gpPercent / 100);
  const courier = couriers.find((item) => item.id === courierId) ?? couriers[0];
  const hub = swapHubs.find((item) => item.id === hubId);
  const shippingFee = method === "courier" ? courier.fee : 0;
  const moneyTotal = productValue - gpUsed + shippingFee + serviceFee;
  const methodValid = method === "courier" ? Boolean(address?.name && address?.phone && address?.address && address?.city && courier) : Boolean(hub);
  const eta = etaStart ? estimateArrival(etaStart, courier.minDays, courier.maxDays) : null;

  useEffect(() => {
    const timerId = window.setTimeout(() => setEtaStart(new Date().toISOString()), 0);
    return () => window.clearTimeout(timerId);
  }, []);

  function addAddress() {
    const values = Object.values(newAddress).map((value) => value.trim());
    if (values.some((value) => !value)) {
      setAddressError("Complete every address field before saving.");
      return;
    }
    const saved: SavedAddress = { id: `address-${Date.now()}`, ...newAddress, name: newAddress.name.trim(), phone: newAddress.phone.trim(), address: newAddress.address.trim(), city: newAddress.city.trim(), postalCode: newAddress.postalCode.trim() };
    setAddress(saved);
    setAddressSheetOpen(false);
    setAddingAddress(false);
    setAddressError("");
  }

  function completeCheckout() {
    if (!entries.length || !methodValid || !hub) return;
    try {
      const orderId = checkout({
        items: entries.map(({ item, product }) => ({ productId: product!.id, productValue: product!.price * item.quantity, quantity: item.quantity })),
        productValue,
        shippingFee,
        serviceFee,
        gpUsed,
        delivery: method === "courier"
          ? {
              method,
              courier: { id: courier.id, name: courier.name, fee: courier.fee, minDays: courier.minDays, maxDays: courier.maxDays },
              address,
              trackingNumber: generateTrackingNumber(courier.id === "sicepat-reg" ? "SCP" : courier.id === "jnt-express" ? "JNT" : "JNE"),
            }
          : {
              method,
              hub: { id: hub.id, name: hub.name, address: hub.address, distance: hub.distance, openingHours: hub.openingHours, position: hub.position },
              pickupCode: generatePickupCode(),
            },
      });
      router.push(`/orders/${orderId}?placed=1`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Checkout could not be completed.");
    }
  }

  return (
    <main className="min-h-dvh px-4 pb-8 pt-5">
      <header className="mb-5 flex items-center gap-3"><Link href="/cart" aria-label="Back to cart" className="flex size-11 items-center justify-center rounded-full text-ink-muted hover:bg-mint-50"><ArrowLeft size={20} /></Link><div><h1 className="text-xl font-semibold text-ink">Checkout</h1><p className="text-xs text-ink-muted">Review your order and payment</p></div></header>
      {!entries.length ? (
        <section className="rounded-2xl bg-mint-50 p-5 text-center"><p className="text-sm text-ink-muted">Add an item to your cart before checkout.</p><Link href="/" className="mt-3 inline-block text-sm font-semibold text-primary">Explore finds</Link></section>
      ) : (
        <>
          <section className="space-y-2">
            {entries.map(({ item, product }) => product && (
              <article key={item.productId} className="flex items-center gap-3 rounded-3xl bg-white p-3 shadow-card">
                <div className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-mint-50"><Image src={product.image} alt={product.imageAlt} fill sizes="64px" className="object-cover" /></div>
                <div className="min-w-0 flex-1"><h2 className="truncate text-sm font-semibold text-ink">{product.name}</h2><p className="text-xs text-ink-muted">Qty {item.quantity}</p></div>
                <p className="text-sm font-semibold text-ink">{formatRupiah(product.price * item.quantity)}</p>
              </article>
            ))}
          </section>

          <section aria-labelledby="delivery-method-heading" className="mt-4 rounded-3xl bg-white p-4 shadow-card">
            <h2 id="delivery-method-heading" className="mb-3 text-base font-semibold text-ink">Delivery method</h2>
            <div className="grid grid-cols-2 gap-2">
              <MethodChoice selected={method === "courier"} onClick={() => setMethod("courier")} icon={<Truck size={18} />} label="Courier delivery" />
              <MethodChoice selected={method === "pickup"} onClick={() => setMethod("pickup")} icon={<Package size={18} />} label="Pick up in person" />
            </div>
            {method === "courier" ? (
              <>
                <div className="mt-3 flex items-start gap-3 rounded-2xl bg-mint-50 p-3">
                  <MapPin size={18} className="mt-0.5 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1"><p className="text-[10px] font-medium text-ink-muted">Deliver to</p><p className="text-xs font-semibold text-ink">{address.name} · {address.phone}</p><p className="mt-0.5 text-xs leading-relaxed text-ink-muted">{address.address}, {address.city} {address.postalCode}</p></div>
                  <button type="button" onClick={() => { setAddressSheetOpen(true); setAddingAddress(false); }} className="min-h-11 shrink-0 px-1 text-xs font-semibold text-primary">Change</button>
                </div>
                <div className="mt-4 flex items-center justify-between"><h3 className="text-sm font-semibold text-ink">Choose a courier</h3><span className="text-[10px] text-ink-muted">{eta ? `${formatOrderDate(eta.from)}–${formatOrderDate(eta.to)}` : "Calculating ETA…"}</span></div>
                <div role="radiogroup" aria-label="Courier service" className="mt-2 space-y-2">
                  {couriers.map((item) => <CourierChoice key={item.id} courier={item} selected={courierId === item.id} onClick={() => setCourierId(item.id)} />)}
                </div>
              </>
            ) : (
              <>
                <div role="radiogroup" aria-label="Pickup Swap Hub" className="mt-3 space-y-2">
                  {swapHubs.map((item) => (
                    <button key={item.id} type="button" role="radio" aria-checked={hubId === item.id} onClick={() => setHubId(item.id)} className={`flex min-h-[68px] w-full items-start gap-3 rounded-2xl border p-3 text-left ${hubId === item.id ? "border-primary bg-mint-50" : "border-border bg-white"}`}>
                      <span className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border ${hubId === item.id ? "border-primary bg-primary text-white" : "border-ink-muted/50 text-transparent"}`}>{hubId === item.id && <Check size={13} />}</span>
                      <span className="min-w-0 flex-1"><span className="block text-xs font-semibold text-ink">{item.name} <span className="font-normal text-ink-muted">· {item.distance}</span></span><span className="mt-0.5 block text-[10px] text-ink-muted">{item.address}</span><span className="block text-[10px] text-ink-muted">{item.openingHours}</span></span>
                    </button>
                  ))}
                </div>
                <Link href="/map" className="mt-2 inline-flex min-h-11 items-center text-xs font-semibold text-primary">View on map <ChevronRight size={14} /></Link>
                <p className="mt-1 rounded-xl bg-mint-50 p-3 text-xs leading-relaxed text-ink-muted">You&apos;ll get a pickup QR code once your order is ready. Pick up within 7 days.</p>
              </>
            )}
          </section>

          <section className="mt-4 rounded-3xl bg-white p-4 shadow-card">
            <div className="flex items-center justify-between"><h2 className="text-base font-semibold text-ink">Green Points</h2><span className="text-xs text-primary">{formatGP(balance)} available</span></div>
            <p className="mt-1 text-xs text-ink-muted">Apply points to product value only. 1 GP = Rp1.</p>
            <div className="mt-4 flex items-center justify-between gap-3"><label htmlFor="gp-percent" className="text-xs font-medium text-ink">Pay with GP</label><span className="rounded-full bg-mint-50 px-2.5 py-1 text-xs font-semibold text-primary">{gpPercent}%</span></div>
            <input id="gp-percent" aria-label="Percent of product value to pay with Green Points" type="range" min="0" max={maxPercent} step="1" value={gpPercent} onChange={(event) => setGpPercent(Number(event.target.value))} className="mt-3 w-full accent-primary" />
            <div className="mt-1 flex justify-between text-[10px] text-ink-muted"><span>Money only</span><span>Up to {maxPercent}% with GP</span></div>
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-mint-50 p-3 text-xs text-ink-muted"><BadgeCheck size={15} className="shrink-0 text-primary" />Shipping and service fees are paid separately in money.</div>
          </section>
          <section className="mt-4 rounded-3xl bg-white p-4 shadow-card">
            <h2 className="mb-3 text-base font-semibold text-ink">Price breakdown</h2>
            <BreakdownRow label="Delivery" value={method === "courier" ? `${courier.name} to ${address.city}` : `Pickup at ${hub?.name ?? "Swap Hub"}`} />
            <BreakdownRow label="Product value" amount={productValue} />
            <BreakdownRow label="Green Points applied" amount={-gpUsed} muted />
            <BreakdownRow label="Shipping fee" value={method === "pickup" ? "Free pickup" : formatRupiah(shippingFee)} />
            <BreakdownRow label="Service fee (demo)" amount={serviceFee} />
            <div className="my-3 border-t border-border" />
            <div className="flex justify-between text-sm font-semibold text-ink"><span>Pay now in money</span><span>{formatRupiah(moneyTotal)}</span></div>
            <p className="mt-3 text-xs text-primary">You&apos;ll earn {formatGP(Math.floor(productValue * 0.02))} after the order is completed.</p>
          </section>
          {!methodValid && <p className="mt-3 text-xs text-warning">Choose a valid delivery address, courier, or pickup Hub to continue.</p>}
          {error && <p role="alert" className="mt-3 rounded-xl bg-danger/10 p-3 text-xs text-danger">{error}</p>}
          <div className="sticky bottom-0 z-10 mt-4 bg-background/95 pb-2 pt-3 backdrop-blur"><button type="button" disabled={!methodValid} onClick={completeCheckout} className="h-12 w-full rounded-full bg-primary text-sm font-semibold text-white shadow-primary hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50">Place order</button></div>
        </>
      )}
      {addressSheetOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-overlay/45 p-0" role="presentation" onClick={() => setAddressSheetOpen(false)}>
          <section role="dialog" aria-modal="true" aria-labelledby="address-sheet-title" onClick={(event) => event.stopPropagation()} className="max-h-[85dvh] w-full max-w-[430px] overflow-y-auto rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-card">
            <div className="mb-4 flex items-center justify-between"><h2 id="address-sheet-title" className="text-lg font-semibold text-ink">{addingAddress ? "Add new address" : "Choose an address"}</h2><button type="button" aria-label="Close address selector" onClick={() => setAddressSheetOpen(false)} className="flex size-11 items-center justify-center rounded-full text-ink-muted hover:bg-mint-50"><X size={20} /></button></div>
            {!addingAddress ? (
              <>
                <div className="space-y-2">
                  {savedAddresses.map((item) => <button key={item.id} type="button" onClick={() => { setAddress(item); setAddressSheetOpen(false); }} className={`w-full rounded-2xl border p-3 text-left ${address.id === item.id ? "border-primary bg-mint-50" : "border-border"}`}><span className="block text-sm font-semibold text-ink">{item.name} <span className="text-xs font-normal text-ink-muted">· {item.phone}</span></span><span className="mt-1 block text-xs text-ink-muted">{item.address}, {item.city} {item.postalCode}</span></button>)}
                </div>
                <button type="button" onClick={() => setAddingAddress(true)} className="mt-3 min-h-11 w-full rounded-full border border-primary px-4 text-sm font-semibold text-primary">Add new address</button>
              </>
            ) : (
              <div className="space-y-3">
                {([
                  ["name", "Full name"], ["phone", "Phone number"], ["address", "Street address"], ["city", "City"], ["postalCode", "Postal code"],
                ] as const).map(([field, label]) => <label key={field} className="block text-xs font-medium text-ink">{label}<input required aria-label={label} value={newAddress[field]} onChange={(event) => setNewAddress((current) => ({ ...current, [field]: event.target.value }))} className="form-input mt-1" /></label>)}
                {addressError && <p role="alert" className="text-xs text-danger">{addressError}</p>}
                <button type="button" onClick={addAddress} className="min-h-11 w-full rounded-full bg-primary text-sm font-semibold text-white">Save address</button>
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}

function MethodChoice({ selected, onClick, icon, label }: { selected: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return <button type="button" role="radio" aria-checked={selected} onClick={onClick} className={`flex min-h-12 items-center justify-center gap-1.5 rounded-xl border px-2 text-[11px] font-semibold ${selected ? "border-primary bg-mint-50 text-primary" : "border-border bg-white text-ink-muted"}`}>{icon}<span>{label}</span>{selected && <Check size={13} />}</button>;
}

function CourierChoice({ courier, selected, onClick }: { courier: Courier; selected: boolean; onClick: () => void }) {
  return <button type="button" role="radio" aria-checked={selected} onClick={onClick} className={`flex min-h-14 w-full items-center gap-3 rounded-2xl border px-3 py-2 text-left ${selected ? "border-primary bg-mint-50" : "border-border bg-white"}`}>
    <span className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${courier.color}`}>{courier.badge}</span>
    <span className="min-w-0 flex-1"><span className="block text-xs font-semibold text-ink">{courier.name}</span><span className="block text-[10px] text-ink-muted">{courier.minDays}–{courier.maxDays} days</span></span>
    <span className="text-xs font-semibold text-ink">{formatRupiah(courier.fee)}</span>
    <span className={`flex size-5 items-center justify-center rounded-full border ${selected ? "border-primary bg-primary text-white" : "border-ink-muted/50 text-transparent"}`}>{selected && <Check size={12} />}</span>
  </button>;
}

function BreakdownRow({ label, amount, value, muted = false }: { label: string; amount?: number; value?: string; muted?: boolean }) {
  const shown = value ?? (amount !== undefined ? amount < 0 ? `−${formatRupiah(Math.abs(amount))}` : formatRupiah(amount) : "");
  return <div className={`mb-2 flex justify-between gap-3 text-xs ${muted ? "text-primary" : "text-ink-muted"}`}><span>{label}</span><span className="text-right font-medium">{shown}</span></div>;
}
