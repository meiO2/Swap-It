
"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  MapPin,
  Package,
  Truck,
  X,
} from "lucide-react";
import { couriers, type Courier } from "@/data/couriers";
import type { IUserAddress } from "@/models/User";
import { estimateArrival, formatOrderDate } from "@/lib/orders";
import { formatRupiah } from "@/lib/format";
import { apiRequest } from "@/lib/api";
import { calculateBuyerServiceFee } from "@/lib/fees";

interface CartProduct {
  _id: string;
  name: string;
  price: number;
  size: string;
  condition: string;
  images: string[];
}

interface CartItem {
  productId: CartProduct;
  addedAt: string;
}

interface CartResponse {
  items: CartItem[];
  itemCount: number;
  subtotal: number;
}

interface OrderResponse {
  id?: string;
  _id?: string;
}

interface ShippingRate {
  courier_code: string;
  courier_name?: string;
  courier_service_code?: string;
  courier_service_name?: string;
  price: number;
  duration?: string;
}

interface GreenPointResponse {
  balance: number;
}

export default function CheckoutPage() {
  const router = useRouter();
  const [items, setItems] = useState<CartItem[]>([]);
  const [cartLoading, setCartLoading] = useState(true);
  const [cartError, setCartError] = useState("");

  const [courierId, setCourierId] = useState(couriers[0].id);
  const [addresses, setAddresses] = useState<IUserAddress[]>([]);
  const [address, setAddress] = useState<IUserAddress>({
    id: "",
    name: "",
    phone: "",
    address: "",
    city: "",
    postalCode: "",
  });

  const [addressSheetOpen, setAddressSheetOpen] = useState(false);
  const [addingAddress, setAddingAddress] = useState(false);
  const [newAddress, setNewAddress] = useState({
    name: "",
    phone: "",
    address: "",
    city: "",
    postalCode: "",
  });

  const [addressError, setAddressError] = useState("");
  const [addressesLoading, setAddressesLoading] = useState(true);
  const [savingAddress, setSavingAddress] = useState(false);
  const [error, setError] = useState("");
  const [placingOrder, setPlacingOrder] = useState(false);
  const [etaStart, setEtaStart] = useState<string | null>(null);
  const [shippingRates, setShippingRates] = useState<ShippingRate[]>([]);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [shippingError, setShippingError] = useState("");
  const [gpBalance, setGpBalance] = useState(0);
  const [gpUsed, setGpUsed] = useState(0);

  const subtotal = useMemo(
    () =>
      items.reduce(
        (sum, item) => sum + (item.productId?.price ?? 0),
        0,
      ),
    [items],
  );

  const courier =
    couriers.find((item) => item.id === courierId) ?? couriers[0];
  const selectedShippingRate = shippingRates.find(
    (rate) => rate.courier_code === courierId,
  );

  const serviceFee = calculateBuyerServiceFee(subtotal);
  const eta = etaStart
    ? estimateArrival(etaStart, courier.minDays, courier.maxDays)
    : null;

  const methodValid = Boolean(
    address.name &&
      address.phone &&
      address.address &&
      address.city &&
      courier &&
      shippingRates.length > 0,
  );

  useEffect(() => {
    const timerId = window.setTimeout(
      () => setEtaStart(new Date().toISOString()),
      0,
    );
    return () => window.clearTimeout(timerId);
  }, []);

  useEffect(() => {
    if (!address.postalCode || !items.length) {
      return;
    }
    let active = true;
    const loadingTimer = window.setTimeout(() => setShippingLoading(true), 0);
    const errorTimer = window.setTimeout(() => setShippingError(""), 0);
    apiRequest<ShippingRate[]>("/api/shipping/rates", {
      method: "POST",
      body: JSON.stringify({ destinationPostalCode: address.postalCode }),
    })
      .then((rates) => {
        if (!active) return;
        const normalized = Array.isArray(rates) ? rates : [];
        setShippingRates(normalized);
        if (normalized.length > 0) setCourierId(normalized[0].courier_code);
      })
      .catch((cause: unknown) => {
        if (active) setShippingError(cause instanceof Error ? cause.message : "Could not load shipping rates.");
      })
      .finally(() => {
        if (active) setShippingLoading(false);
      });
    return () => {
      active = false;
      window.clearTimeout(loadingTimer);
      window.clearTimeout(errorTimer);
    };
  }, [address.postalCode, items.length]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      apiRequest<GreenPointResponse>("/api/green-points")
        .then((data) => {
          const balance = Math.max(0, data.balance);
          setGpBalance(balance);
          setGpUsed(Math.min(balance, subtotal));
        })
        .catch((cause: unknown) => console.error("Could not load Green Point balance.", cause));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [subtotal]);

  // Load the actual MongoDB cart.
  useEffect(() => {
    let active = true;

    async function loadCart() {
      try {
        setCartLoading(true);
        setCartError("");

        const result = await apiRequest<CartResponse>("/api/cart");

        if (active) {
          setItems(result.items ?? []);
        }
      } catch (cause) {
        if (active) {
          setCartError(
            cause instanceof Error
              ? cause.message
              : "Could not load your cart.",
          );
        }
      } finally {
        if (active) setCartLoading(false);
      }
    }

    loadCart();

    return () => {
      active = false;
    };
  }, []);

  // Load saved delivery addresses.
  useEffect(() => {
    let active = true;

    async function loadAddresses() {
      try {
        const saved =
          await apiRequest<IUserAddress[]>("/api/profile/addresses");

        if (active) {
          setAddresses(saved);

          if (saved.length) {
            setAddress(saved[0]);
          }
        }
      } catch (cause) {
        if (active) {
          setAddressError(
            cause instanceof Error
              ? cause.message
              : "Could not load saved addresses.",
          );
        }
      } finally {
        if (active) setAddressesLoading(false);
      }
    }

    loadAddresses();

    return () => {
      active = false;
    };
  }, []);

  async function addAddress() {
    const values = Object.values(newAddress).map((value) =>
      value.trim(),
    );

    if (values.some((value) => !value)) {
      setAddressError("Complete every address field before saving.");
      return;
    }

    setSavingAddress(true);
    setAddressError("");

    try {
      const saved = await apiRequest<IUserAddress>(
        "/api/profile/addresses",
        {
          method: "POST",
          body: JSON.stringify(newAddress),
        },
      );

      setAddresses((current) => [...current, saved]);
      setAddress(saved);
      setAddressSheetOpen(false);
      setAddingAddress(false);

      setNewAddress({
        name: "",
        phone: "",
        address: "",
        city: "",
        postalCode: "",
      });
    } catch (cause) {
      setAddressError(
        cause instanceof Error
          ? cause.message
          : "Could not save this address.",
      );
    } finally {
      setSavingAddress(false);
    }
  }

  async function completeCheckout() {
    if (!items.length || !methodValid || placingOrder) return;

    setPlacingOrder(true);
    setError("");

    try {
      const order = await apiRequest<OrderResponse>("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          deliveryMethod: "courier",
          gpUsed,
          courierCode: courierId,
          shippingAddress: {
            name: address.name,
            phone: address.phone,
            address: address.address,
            city: address.city,
            postalCode: address.postalCode,
          },
        }),
      });

      const orderId = order.id ?? order._id;

      if (!orderId) {
        throw new Error(
          "Order was created, but its ID was not returned. Please check your orders before trying again.",
        );
      }

      router.push(`/payment?orderId=${orderId}`);
    } catch (cause) {
      router.push(
        `/cart?paymentError=${encodeURIComponent(
          cause instanceof Error
            ? cause.message
            : "Checkout could not be completed.",
        )}`,
      );
    } finally {
      setPlacingOrder(false);
    }
  }

  return (
    <main className="min-h-dvh px-4 pb-8 pt-5">
      <header className="mb-5 flex items-center gap-3">
        <Link
          href="/cart"
          aria-label="Back to cart"
          className="flex size-11 items-center justify-center rounded-full text-ink-muted hover:bg-mint-50"
        >
          <ArrowLeft size={20} />
        </Link>

        <div>
          <h1 className="text-xl font-semibold text-ink">Checkout</h1>
          <p className="text-xs text-ink-muted">
            Review your order and delivery
          </p>
        </div>
      </header>

      {cartLoading ? (
        <section className="rounded-2xl bg-mint-50 p-6 text-center">
          <Package className="mx-auto animate-pulse text-primary" size={30} />
          <p className="mt-3 text-sm text-ink-muted">
            Loading your cart...
          </p>
        </section>
      ) : cartError ? (
        <section className="rounded-2xl bg-mint-50 p-5 text-center">
          <p className="text-sm text-danger">{cartError}</p>
          <Link
            href="/cart"
            className="mt-3 inline-block text-sm font-semibold text-primary"
          >
            Return to cart
          </Link>
        </section>
      ) : !items.length ? (
        <section className="rounded-2xl bg-mint-50 p-5 text-center">
          <p className="text-sm text-ink-muted">
            Add an item to your cart before checkout.
          </p>
          <Link
            href="/"
            className="mt-3 inline-block text-sm font-semibold text-primary"
          >
            Explore finds
          </Link>
        </section>
      ) : (
        <>
          {/* Order items */}
          <section className="space-y-2">
            {items.map((item) => {
              const product = item.productId;

              if (!product?._id) return null;

              return (
                <article
                  key={product._id}
                  className="flex items-center gap-3 rounded-3xl bg-white p-3 shadow-card"
                >
                  <div className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-mint-50">
                    <Image
                      src={product.images?.[0] || "/logo.png"}
                      alt={product.name}
                      fill
                      sizes="64px"
                      className="object-cover"
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-sm font-semibold text-ink">
                      {product.name}
                    </h2>
                    <p className="text-xs text-ink-muted">
                      Size {product.size} · {product.condition}
                    </p>
                  </div>

                  <p className="text-sm font-semibold text-ink">
                    {formatRupiah(product.price)}
                  </p>
                </article>
              );
            })}
          </section>

          {/* Delivery method */}
          <section
            aria-labelledby="delivery-method-heading"
            className="mt-4 rounded-3xl bg-white p-4 shadow-card"
          >
            <h2
              id="delivery-method-heading"
              className="mb-3 text-base font-semibold text-ink"
            >
              Delivery method
            </h2>

            <div className="flex items-center gap-3 rounded-2xl bg-mint-50 p-3">
              <Truck size={18} className="text-primary" />
              <p className="text-xs font-medium text-ink">
                Courier delivery only
              </p>
            </div>
            <>
                <div className="mt-3 flex items-start gap-3 rounded-2xl bg-mint-50 p-3">
                  <MapPin
                    size={18}
                    className="mt-0.5 shrink-0 text-primary"
                  />

                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-medium text-ink-muted">
                      Deliver to
                    </p>

                    {address.id ? (
                      <>
                        <p className="text-xs font-semibold text-ink">
                          {address.name} · {address.phone}
                        </p>
                        <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
                          {address.address}, {address.city}{" "}
                          {address.postalCode}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-xs text-ink-muted">
                          {addressesLoading
                            ? "Loading saved addresses..."
                            : "No saved delivery address."}
                        </p>
                        <Link
                          href="/profile/settings"
                          className="mt-1 inline-block text-xs font-semibold text-primary"
                        >
                          Add address in Settings
                        </Link>
                      </>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setAddressSheetOpen(true);
                      setAddingAddress(false);
                    }}
                    className="min-h-11 shrink-0 px-1 text-xs font-semibold text-primary"
                  >
                    Change
                  </button>
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-ink">
                    Choose a courier
                  </h3>
                  <span className="text-[10px] text-ink-muted">
                    {eta
                      ? `${formatOrderDate(eta.from)}–${formatOrderDate(eta.to)}`
                      : "Calculating ETA..."}
                  </span>
                </div>

                <div
                  role="radiogroup"
                  aria-label="Courier service"
                  className="mt-2 space-y-2"
                >
                  {shippingLoading ? <p className="rounded-xl bg-mint-50 p-3 text-xs text-ink-muted">Loading Biteship rates...</p> : shippingError ? <p className="rounded-xl bg-danger/10 p-3 text-xs text-danger">{shippingError}</p> : shippingRates.map((rate) => {
                    const item: Courier = {
                      id: rate.courier_code,
                      name: `${rate.courier_name ?? rate.courier_code.toUpperCase()} ${rate.courier_service_name ?? ""}`.trim(),
                      badge: (rate.courier_name ?? rate.courier_code).slice(0, 1).toUpperCase(),
                      fee: rate.price,
                      minDays: 1,
                      maxDays: 7,
                      color: "bg-info/15 text-info",
                    };
                    return (
                    <CourierChoice
                      key={`${rate.courier_code}-${rate.courier_service_code ?? rate.courier_service_name ?? ""}`}
                      courier={item}
                      selected={courierId === item.id}
                      onClick={() => setCourierId(item.id)}
                    />
                    );
                  })}
                </div>
            </>
          </section>

          {/* Green Points */}
          <section className="mt-4 rounded-3xl bg-white p-4 shadow-card">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-ink">
                Green Points
              </h2>
              <span className="text-sm font-semibold text-primary">
                {gpUsed.toLocaleString("id-ID")} GP
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={Math.min(gpBalance, subtotal)}
              step={1}
              value={gpUsed}
              onChange={(event) => setGpUsed(Number(event.target.value))}
              aria-label="Green Points to use"
              className="mt-4 h-2 w-full cursor-pointer accent-primary"
            />
            <div className="mt-1 flex justify-between text-[10px] text-ink-muted">
              <span>0 GP</span>
              <span>{Math.min(gpBalance, subtotal).toLocaleString("id-ID")} GP available</span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-ink-muted">
              Choose how many Green Points to use. Shipping cannot be paid
              with GP.
            </p>
          </section>

          {/* Price breakdown */}
          <section className="mt-4 rounded-3xl bg-white p-4 shadow-card">
            <h2 className="mb-3 text-base font-semibold text-ink">
              Price breakdown
            </h2>

            <p className="mb-3 rounded-xl bg-warning/10 p-3 text-xs leading-relaxed text-ink">
              Shipping rates are calculated by Biteship using the selected
              destination and courier. The backend recalculates the rate
              before creating the order.
            </p>

            <BreakdownRow
              label="Product value"
              amount={subtotal}
            />

            <BreakdownRow
              label="Delivery"
              value={`${selectedShippingRate?.courier_name ?? courier.name} to ${address.city || "your address"}`}
            />

            <BreakdownRow
              label="Green Points applied"
              value={`${gpUsed.toLocaleString("id-ID")} GP`}
            />

            <BreakdownRow
              label="Shipping fee"
              value={formatRupiah(selectedShippingRate?.price ?? 0)}
            />

            <BreakdownRow
              label="Service fee (2.5%)"
              amount={serviceFee}
            />

            <div className="my-3 border-t border-border" />

            <div className="flex justify-between text-sm font-semibold text-ink">
              <span>Pay now in money</span>
              <span>
                {formatRupiah(
                  Math.max(
                    0,
                    subtotal +
                      (selectedShippingRate?.price ?? 0) +
                      serviceFee -
                      gpUsed,
                  ),
                )}
              </span>
            </div>
          </section>

          {!methodValid && (
            <p className="mt-3 text-xs text-warning">
              Choose a valid delivery address and courier to continue.
            </p>
          )}

          {error && (
            <p
              role="alert"
              className="mt-3 rounded-xl bg-danger/10 p-3 text-xs text-danger"
            >
              {error}
            </p>
          )}

          <div className="sticky bottom-0 z-10 mt-4 bg-background/95 pb-2 pt-3 backdrop-blur">
            <button
              type="button"
              disabled={!methodValid || placingOrder}
              onClick={completeCheckout}
              className="h-12 w-full rounded-full bg-primary text-sm font-semibold text-white shadow-primary hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
            >
              {placingOrder ? "Placing order..." : "Place order"}
            </button>
          </div>
        </>
      )}

      {/* Address selector */}
      {addressSheetOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-overlay/45 p-0"
          role="presentation"
          onClick={() => setAddressSheetOpen(false)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="address-sheet-title"
            onClick={(event) => event.stopPropagation()}
            className="max-h-[85dvh] w-full max-w-[430px] overflow-y-auto rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-card"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2
                id="address-sheet-title"
                className="text-lg font-semibold text-ink"
              >
                {addingAddress ? "Add new address" : "Choose an address"}
              </h2>

              <button
                type="button"
                aria-label="Close address selector"
                onClick={() => setAddressSheetOpen(false)}
                className="flex size-11 items-center justify-center rounded-full text-ink-muted hover:bg-mint-50"
              >
                <X size={20} />
              </button>
            </div>

            {!addingAddress ? (
              <>
                <div className="space-y-2">
                  {addressesLoading ? (
                    <p
                      role="status"
                      className="py-3 text-xs text-ink-muted"
                    >
                      Loading saved addresses...
                    </p>
                  ) : addresses.length ? (
                    addresses.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setAddress(item);
                          setAddressSheetOpen(false);
                        }}
                        className={`w-full rounded-2xl border p-3 text-left ${
                          address.id === item.id
                            ? "border-primary bg-mint-50"
                            : "border-border"
                        }`}
                      >
                        <span className="block text-sm font-semibold text-ink">
                          {item.name}{" "}
                          <span className="text-xs font-normal text-ink-muted">
                            · {item.phone}
                          </span>
                        </span>
                        <span className="mt-1 block text-xs text-ink-muted">
                          {item.address}, {item.city} {item.postalCode}
                        </span>
                      </button>
                    ))
                  ) : (
                    <p className="py-3 text-xs text-ink-muted">
                      No saved addresses yet. Add one to use courier
                      delivery.
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setAddingAddress(true)}
                  className="mt-3 min-h-11 w-full rounded-full border border-primary px-4 text-sm font-semibold text-primary"
                >
                  Add new address
                </button>
              </>
            ) : (
              <div className="space-y-3">
                {(
                  [
                    ["name", "Full name"],
                    ["phone", "Phone number"],
                    ["address", "Street address"],
                    ["city", "City"],
                    ["postalCode", "Postal code"],
                  ] as const
                ).map(([field, label]) => (
                  <label
                    key={field}
                    className="block text-xs font-medium text-ink"
                  >
                    {label}
                    <input
                      required
                      aria-label={label}
                      value={newAddress[field]}
                      onChange={(event) =>
                        setNewAddress((current) => ({
                          ...current,
                          [field]: event.target.value,
                        }))
                      }
                      className="form-input mt-1"
                    />
                  </label>
                ))}

                {addressError && (
                  <p role="alert" className="text-xs text-danger">
                    {addressError}
                  </p>
                )}

                <button
                  type="button"
                  disabled={savingAddress}
                  onClick={() => void addAddress()}
                  className="min-h-11 w-full rounded-full bg-primary text-sm font-semibold text-white disabled:opacity-60"
                >
                  {savingAddress ? "Saving..." : "Save address"}
                </button>
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}

function CourierChoice({
  courier,
  selected,
  onClick,
}: {
  courier: Courier;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={`flex min-h-14 w-full items-center gap-3 rounded-2xl border px-3 py-2 text-left ${
        selected ? "border-primary bg-mint-50" : "border-border bg-white"
      }`}
    >
      <span
        className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${courier.color}`}
      >
        {courier.badge}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold text-ink">
          {courier.name}
        </span>
        <span className="block text-[10px] text-ink-muted">
          {courier.minDays}–{courier.maxDays} days
        </span>
      </span>

      <span className="text-xs font-semibold text-ink">
        {formatRupiah(courier.fee)}
      </span>

      <span
        className={`flex size-5 items-center justify-center rounded-full border ${
          selected
            ? "border-primary bg-primary text-white"
            : "border-ink-muted/50 text-transparent"
        }`}
      >
        {selected && <Check size={12} />}
      </span>
    </button>
  );
}

function BreakdownRow({
  label,
  amount,
  value,
}: {
  label: string;
  amount?: number;
  value?: string;
}) {
  const shown =
    value ??
    (amount !== undefined ? formatRupiah(amount) : "");

  return (
    <div className="mb-2 flex justify-between gap-3 text-xs text-ink-muted">
      <span>{label}</span>
      <span className="text-right font-medium">{shown}</span>
    </div>
  );
}
