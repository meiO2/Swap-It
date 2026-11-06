
"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  MapPin,
  Package,
  Truck,
  X,
} from "lucide-react";
import { swapHubs } from "@/data/mock";
import { couriers, type Courier } from "@/data/couriers";
import type { IUserAddress } from "@/models/User";
import { estimateArrival, formatOrderDate } from "@/lib/orders";
import { formatRupiah } from "@/lib/format";
import { apiRequest } from "@/lib/api";

const serviceFee = 5000;

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

export default function CheckoutPage() {
  const router = useRouter();

  const [items, setItems] = useState<CartItem[]>([]);
  const [cartLoading, setCartLoading] = useState(true);
  const [cartError, setCartError] = useState("");

  const [method, setMethod] = useState<"courier" | "pickup">("courier");
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

  const [hubId, setHubId] = useState(swapHubs[0].id);
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

  const hub = swapHubs.find((item) => item.id === hubId);

  const eta = etaStart
    ? estimateArrival(etaStart, courier.minDays, courier.maxDays)
    : null;

  const methodValid =
    method === "courier"
      ? Boolean(
          address.name &&
            address.phone &&
            address.address &&
            address.city &&
            courier,
        )
      : Boolean(hub);

  useEffect(() => {
    const timerId = window.setTimeout(
      () => setEtaStart(new Date().toISOString()),
      0,
    );

    return () => window.clearTimeout(timerId);
  }, []);

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
          deliveryMethod: method,

          ...(method === "courier"
            ? {
                shippingAddress: {
                  name: address.name,
                  phone: address.phone,
                  address: address.address,
                  city: address.city,
                  postalCode: address.postalCode,
                },
              }
            : {}),
        }),
      });

      const orderId = order.id ?? order._id;

      if (!orderId) {
        throw new Error(
          "Order was created, but its ID was not returned. Please check your orders before trying again.",
        );
      }

      // The backend already clears the MongoDB cart.
      router.push(`/orders/${orderId}?placed=1`);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Checkout could not be completed.",
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

            <div className="grid grid-cols-2 gap-2">
              <MethodChoice
                selected={method === "courier"}
                onClick={() => setMethod("courier")}
                icon={<Truck size={18} />}
                label="Courier delivery"
              />

              <MethodChoice
                selected={method === "pickup"}
                onClick={() => setMethod("pickup")}
                icon={<Package size={18} />}
                label="Pick up in person"
              />
            </div>

            {method === "courier" ? (
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
                  {couriers.map((item) => (
                    <CourierChoice
                      key={item.id}
                      courier={item}
                      selected={courierId === item.id}
                      onClick={() => setCourierId(item.id)}
                    />
                  ))}
                </div>
              </>
            ) : (
              <>
                <div
                  role="radiogroup"
                  aria-label="Pickup Swap Hub"
                  className="mt-3 space-y-2"
                >
                  {swapHubs.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      role="radio"
                      aria-checked={hubId === item.id}
                      onClick={() => setHubId(item.id)}
                      className={`flex min-h-[68px] w-full items-start gap-3 rounded-2xl border p-3 text-left ${
                        hubId === item.id
                          ? "border-primary bg-mint-50"
                          : "border-border bg-white"
                      }`}
                    >
                      <span
                        className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border ${
                          hubId === item.id
                            ? "border-primary bg-primary text-white"
                            : "border-ink-muted/50 text-transparent"
                        }`}
                      >
                        {hubId === item.id && <Check size={13} />}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-semibold text-ink">
                          {item.name}{" "}
                          <span className="font-normal text-ink-muted">
                            · {item.distance}
                          </span>
                        </span>
                        <span className="mt-0.5 block text-[10px] text-ink-muted">
                          {item.address}
                        </span>
                        <span className="block text-[10px] text-ink-muted">
                          {item.openingHours}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>

                <Link
                  href="/map"
                  className="mt-2 inline-flex min-h-11 items-center text-xs font-semibold text-primary"
                >
                  View on map <ChevronRight size={14} />
                </Link>

                <p className="mt-1 rounded-xl bg-mint-50 p-3 text-xs leading-relaxed text-ink-muted">
                  Your selected Hub is currently a frontend selection.
                  The order API does not yet save the Hub ID.
                </p>
              </>
            )}
          </section>

          {/* Green Points */}
          <section className="mt-4 rounded-3xl bg-white p-4 shadow-card">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-ink">
                Green Points
              </h2>
              <span className="text-xs text-ink-muted">
                Unavailable at checkout
              </span>
            </div>

            <p className="mt-2 text-xs leading-relaxed text-ink-muted">
              Wallet balances are currently local demo data and are not
              deducted by the backend. Green Points cannot be applied
              until a wallet API is available.
            </p>
          </section>

          {/* Price breakdown */}
          <section className="mt-4 rounded-3xl bg-white p-4 shadow-card">
            <h2 className="mb-3 text-base font-semibold text-ink">
              Price breakdown
            </h2>

            <p className="mb-3 rounded-xl bg-warning/10 p-3 text-xs leading-relaxed text-ink">
              Prototype checkout only: this creates an order record but
              does not collect payment. The current backend records the
              product subtotal and does not yet apply courier or service
              fees.
            </p>

            <BreakdownRow
              label="Product subtotal"
              amount={subtotal}
            />

            <BreakdownRow
              label="Courier selection"
              value={
                method === "courier"
                  ? courier.name
                  : "Swap Hub pickup"
              }
            />

            <div className="my-3 border-t border-border" />

            <div className="flex justify-between text-sm font-semibold text-ink">
              <span>Order total recorded by backend</span>
              <span>{formatRupiah(subtotal)}</span>
            </div>

            <p className="mt-3 text-xs text-ink-muted">
              Green Point rewards are not issued because no wallet
              integration is available.
            </p>
          </section>

          {!methodValid && (
            <p className="mt-3 text-xs text-warning">
              Choose a valid delivery address or pickup Hub to continue.
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

function MethodChoice({
  selected,
  onClick,
  icon,
  label,
}: {
  selected: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={`flex min-h-12 items-center justify-center gap-1.5 rounded-xl border px-2 text-[11px] font-semibold ${
        selected
          ? "border-primary bg-mint-50 text-primary"
          : "border-border bg-white text-ink-muted"
      }`}
    >
      {icon}
      <span>{label}</span>
      {selected && <Check size={13} />}
    </button>
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
