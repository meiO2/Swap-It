
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Camera, CircleHelp } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";
import type { IUserAddress } from "@/models/User";

export default function SellPage() {
  const router = useRouter();

  const [fulfillment, setFulfillment] = useState<
    "Swap Hub drop-off" | "Pickup"
  >("Swap Hub drop-off");

  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [addresses, setAddresses] = useState<IUserAddress[]>([]);
  const [addressId, setAddressId] = useState("");

  useEffect(() => {
    apiRequest<IUserAddress[]>("/api/profile/addresses")
      .then((saved) => {
        setAddresses(saved);

        if (saved.length) {
          setAddressId(saved[0].id);
        }
      })
      .catch((cause: unknown) => {
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not load pickup addresses.",
        );
      });
  }, []);

  async function submitProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);

    const name = String(formData.get("name") ?? "").trim();
    const description = String(
      formData.get("description") ?? "",
    ).trim();

    const price = Number(formData.get("price"));
    const image = String(formData.get("image") ?? "").trim();

    const pickupDate = String(
      formData.get("pickupDate") ?? "",
    );

    if (!name || !description) {
      setError("Please enter a product name and description.");
      return;
    }

    if (!Number.isFinite(price) || price <= 0) {
      setError("Enter a positive product price.");
      return;
    }

    if (fulfillment === "Pickup") {
      if (!addressId) {
        setError(
          "Save and choose a pickup address in Settings before submitting.",
        );
        return;
      }

      if (!pickupDate) {
        setError("Please select a pickup date.");
        return;
      }
    }

    setSubmitting(true);
    setError("");

    try {
      await apiRequest("/api/products", {
        method: "POST",
        body: JSON.stringify({
          name,
          description,
          category: String(formData.get("category") ?? ""),
          size: String(formData.get("size") ?? ""),
          condition: String(formData.get("condition") ?? ""),
          price,
          images: image ? [image] : [],
          fulfillment,
          pickupDate:
            fulfillment === "Pickup" ? pickupDate : undefined,
          pickupAddressId:
            fulfillment === "Pickup" ? addressId : undefined,
        }),
      });

      router.push("/products");
      router.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The product could not be submitted.",
      );

      setSubmitting(false);
    }
  }

  return (
    <main className="px-4 pb-6 pt-5">
      <header className="mb-5 flex items-center gap-3">
        <Link
          href="/"
          aria-label="Back home"
          className="rounded-full p-2 text-ink-muted hover:bg-mint-50"
        >
          <ArrowLeft size={20} />
        </Link>

        <div>
          <h1 className="text-xl font-semibold text-ink">
            Sell a piece
          </h1>
          <p className="text-xs text-ink-muted">
            Give something good another chapter
          </p>
        </div>
      </header>

      <form onSubmit={submitProduct} className="space-y-4">
        <div className="flex items-start gap-2 rounded-xl bg-mint-50 p-3 text-xs text-ink-muted">
          <Camera size={17} className="shrink-0 text-primary" />
          <span>
            Image upload is not connected yet. You can optionally add
            a public image URL.
          </span>
        </div>

        <Field label="Product image URL (optional)">
          <input
            name="image"
            type="url"
            maxLength={2000}
            placeholder="https://…"
            className="form-input"
          />
        </Field>

        <Field label="Product name">
          <input
            name="name"
            required
            maxLength={70}
            placeholder="e.g. Linen blend shirt"
            className="form-input"
          />
        </Field>

        <Field label="Description">
          <textarea
            name="description"
            required
            maxLength={2000}
            rows={4}
            placeholder="Describe your item, its details, and anything buyers should know..."
            className="form-input"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Category">
            <select
              name="category"
              required
              className="form-input"
            >
              <option value="">Select</option>
              {[
                "Tops",
                "Bottoms",
                "Dresses",
                "Outerwear",
                "Accessories",
                "Shoes",
              ].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </Field>

          <Field label="Size">
            <select name="size" required className="form-input">
              <option value="">Select</option>
              {["XS", "S", "M", "L", "XL", "One size"].map(
                (item) => (
                  <option key={item}>{item}</option>
                ),
              )}
            </select>
          </Field>
        </div>

        <Field label="Condition">
          <select
            name="condition"
            required
            className="form-input"
          >
            <option value="">Select condition</option>
            <option value="LIKE_NEW">Like new</option>
            <option value="GOOD">Very good</option>
            <option value="FAIR">Good</option>
          </select>
        </Field>

        <Field label="Listing price (Rp)">
          <input
            name="price"
            type="number"
            min="1"
            step="1"
            required
            placeholder="125000"
            className="form-input"
          />
        </Field>

        <fieldset>
          <legend className="mb-2 text-xs font-semibold text-ink">
            How will you hand it over?
          </legend>

          <div className="grid grid-cols-2 gap-2">
            {(
              ["Swap Hub drop-off", "Pickup"] as const
            ).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={fulfillment === option}
                onClick={() => setFulfillment(option)}
                className={`rounded-xl border p-3 text-left text-xs ${
                  fulfillment === option
                    ? "border-primary bg-mint-50 text-primary"
                    : "border-border bg-white text-ink-muted"
                }`}
              >
                <span className="block font-semibold">
                  {option}
                </span>

                <span className="mt-1 block text-[10px]">
                  {option === "Pickup"
                    ? "Pickup service · extra fee applies"
                    : "Show your unique QR at a hub"}
                </span>
              </button>
            ))}
          </div>
        </fieldset>

        {fulfillment === "Pickup" && (
          <>
            <Field label="Pickup address">
              <select
                value={addressId}
                onChange={(event) =>
                  setAddressId(event.target.value)
                }
                required
                className="form-input"
              >
                <option value="">Select a saved address</option>

                {addresses.map((address) => (
                  <option key={address.id} value={address.id}>
                    {address.name} — {address.address},{" "}
                    {address.city}
                  </option>
                ))}
              </select>
            </Field>

            {!addresses.length && (
              <Link
                href="/profile/settings"
                className="block text-xs font-semibold text-primary"
              >
                Add a pickup address in Settings →
              </Link>
            )}

            <Field label="Pickup date">
              <input
                name="pickupDate"
                type="date"
                required
                className="form-input"
              />
            </Field>
          </>
        )}

        <div className="flex gap-2 rounded-xl bg-mint-50 p-3 text-[10px] leading-relaxed text-ink-muted">
          <CircleHelp
            size={15}
            className="mt-0.5 shrink-0 text-primary"
          />
          <span>
            Your product becomes visible in the marketplace after
            submission. SwapIt performs quality inspection after a
            buyer purchases the item and you hand it over to SwapIt.
          </span>
        </div>

        {error && (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="h-12 w-full rounded-full bg-primary text-sm font-semibold text-white shadow-primary hover:bg-primary-dark disabled:opacity-60"
        >
          {submitting ? "Submitting…" : "Publish product"}
        </button>
      </form>
    </main>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-xs font-semibold text-ink">
      {label}
      <span className="mt-1.5 block">{children}</span>
    </label>
  );
}
