
"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Camera, CircleHelp } from "lucide-react";
import { ChangeEvent, FormEvent, use, useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";
import { parseListingPrice } from "@/lib/format";
import type { IUserAddress } from "@/models/User";

type EditableProduct = {
  _id: string;
  name: string;
  description: string;
  category: string;
  brand?: string;
  price: number;
  size: string;
  condition: "NEW" | "LIKE_NEW" | "GOOD" | "FAIR";
  images: string[];
  fulfillment: "Swap Hub drop-off" | "Pickup";
  pickupDate?: string;
  pickupAddress?: IUserAddress;
  status: "AVAILABLE" | string;
};

export default function SellPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const router = useRouter();
  const search = use(searchParams);
  const productId = typeof search.edit === "string" ? search.edit : "";
  const [editingProduct, setEditingProduct] =
    useState<EditableProduct | null>(null);
  const [loadingProduct, setLoadingProduct] = useState(Boolean(productId));
  const [fulfillment, setFulfillment] = useState<
    "Swap Hub drop-off" | "Pickup"
  >("Swap Hub drop-off");

  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [addresses, setAddresses] = useState<IUserAddress[]>([]);
  const [addressId, setAddressId] = useState("");
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);

  useEffect(() => {
    if (!productId) return;

    apiRequest<EditableProduct>(
      `/api/products/${encodeURIComponent(productId)}`,
    )
      .then((product) => {
        setEditingProduct(product);
        setFulfillment(product.fulfillment);
        setAddressId(product.pickupAddress?.id ?? "");
        if (product.status !== "AVAILABLE") {
          setError("Only available listings can be edited.");
        }
      })
      .catch((cause: unknown) => {
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not load this product for editing.",
        );
      })
      .finally(() => setLoadingProduct(false));
  }, [productId]);

  useEffect(() => {
    return () => {
      imagePreviews.forEach((preview) => URL.revokeObjectURL(preview));
    };
  }, [imagePreviews]);

  function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    imagePreviews.forEach((preview) => URL.revokeObjectURL(preview));
    const files = Array.from(event.target.files ?? []).slice(0, 8);
    setImagePreviews(files.map((file) => URL.createObjectURL(file)));
  }

  useEffect(() => {
    apiRequest<IUserAddress[]>("/api/profile/addresses")
      .then((saved) => {
        setAddresses(saved);

        setAddressId((current) => current || saved[0]?.id || "");
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
    if (productId && (!editingProduct || editingProduct.status !== "AVAILABLE")) {
      return;
    }

    const formData = new FormData(event.currentTarget);

    const name = String(formData.get("name") ?? "").trim();
    const description = String(
      formData.get("description") ?? "",
    ).trim();

    const price = parseListingPrice(String(formData.get("price") ?? ""));
    const image = String(formData.get("image") ?? "").trim();
    const imageFiles = formData
      .getAll("images")
      .filter((entry): entry is File => entry instanceof File && entry.size > 0);

    if (imageFiles.length > 8) {
      setError("Upload no more than 8 product images.");
      return;
    }

    const pickupDate = String(
      formData.get("pickupDate") ?? "",
    );

    if (!name || !description) {
      setError("Please enter a product name and description.");
      return;
    }

    if (price === null) {
      setError("Enter a whole rupiah price, for example 50000 or 50.000.");
      return;
    }

    if (fulfillment === "Pickup") {
      if (!addressId || !addresses.some((address) => address.id === addressId)) {
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
      let images = image ? [image] : [];
      if (imageFiles.length > 0) {
        const uploadData = new FormData();
        imageFiles.forEach((file) => uploadData.append("images", file));
        images = await apiRequest<string[]>("/api/uploads", {
          method: "POST",
          body: uploadData,
        });
      }

      const today = new Date();
      const todayString = [
        today.getFullYear(),
        String(today.getMonth() + 1).padStart(2, "0"),
        String(today.getDate()).padStart(2, "0"),
      ].join("-");
      const keepPastPickupDate =
        editingProduct?.pickupDate === pickupDate &&
        pickupDate < todayString;
      const productData = {
        name,
        description,
        category: String(formData.get("category") ?? ""),
        brand: String(formData.get("brand") ?? "").trim(),
        size: String(formData.get("size") ?? ""),
        condition: String(formData.get("condition") ?? ""),
        price,
        ...(images.length > 0
          ? { images }
          : image
            ? { images: [image] }
            : {}),
        fulfillment,
        pickupDate:
          fulfillment === "Pickup" && !keepPastPickupDate
            ? pickupDate
            : undefined,
        pickupAddressId:
          fulfillment === "Pickup" ? addressId : undefined,
      };

      await apiRequest(
        productId ? `/api/products/${encodeURIComponent(productId)}` : "/api/products",
        {
          method: productId ? "PATCH" : "POST",
          body: JSON.stringify(productData),
        },
      );

      router.push(productId ? "/listings" : "/products");
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
    <main className="mx-auto w-full max-w-[520px] px-4 pb-6 pt-5">
      <header className="relative mb-5 flex items-center justify-center">
        <Link
          href="/"
          aria-label="Back home"
          className="absolute left-0 rounded-full p-2 text-ink-muted hover:bg-mint-50"
        >
          <ArrowLeft size={20} />
        </Link>

        <div className="text-center">
          <h1 className="text-xl font-semibold text-ink">
            {productId ? "Edit listing" : "Sell a piece"}
          </h1>
          <p className="text-xs text-ink-muted">
            {productId
              ? "Update the details of your product"
              : "Give something good another chapter"}
          </p>
        </div>
      </header>

      <form
        key={editingProduct?._id ?? "new"}
        onSubmit={submitProduct}
        className="mx-auto w-full space-y-4"
      >
        {loadingProduct && (
          <p role="status" className="text-center text-xs text-ink-muted">
            Loading listing...
          </p>
        )}

        <div className="flex items-center justify-center gap-2 rounded-xl bg-mint-50 p-3 text-center text-xs text-ink-muted">
          <Camera size={17} className="shrink-0 text-primary" />
          <span>
            Upload up to 8 product images, or optionally add a public image URL.
          </span>
        </div>

        <Field label="Product images (optional)">
          <div className="relative flex h-12 w-full items-center justify-center overflow-hidden rounded-xl border border-border bg-white text-center text-xs text-ink-muted">
            <span className="pointer-events-none">
              {imagePreviews.length > 0
                ? `${imagePreviews.length} image${imagePreviews.length === 1 ? "" : "s"} selected`
                : editingProduct?.images.length
                  ? `${editingProduct.images.length} current image${editingProduct.images.length === 1 ? "" : "s"}`
                  : "Choose files"}
            </span>
            <input
              name="images"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={handleImageChange}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </div>
          {(imagePreviews.length > 0 || editingProduct?.images.length) && (
            <div className="mt-3 grid grid-cols-4 gap-2">
              {(imagePreviews.length > 0
                ? imagePreviews
                : editingProduct?.images ?? []
              ).map((preview, index) => (
                <div key={preview} className="relative aspect-square overflow-hidden rounded-xl bg-mint-50">
                  <Image
                    src={preview}
                    alt={`Selected product image ${index + 1}`}
                    fill
                    unoptimized
                    sizes="25vw"
                    className="object-cover"
                  />
                </div>
              ))}
            </div>
          )}
        </Field>

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
            maxLength={120}
            defaultValue={editingProduct?.name}
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
            defaultValue={editingProduct?.description}
            placeholder="Describe your item, its details, and anything buyers should know..."
            className="form-input w-full resize-none text-left"
          />
        </Field>

        <Field label="Brand (optional)">
          <input
            name="brand"
            maxLength={80}
            defaultValue={editingProduct?.brand ?? ""}
            placeholder="e.g. Uniqlo"
            className="form-input"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Category">
            <select
              name="category"
              required
              defaultValue={editingProduct?.category ?? ""}
              className="form-input"
            >
              <option value="">Select</option>
              {editingProduct?.category &&
                ![
                  "Tops",
                  "Bottoms",
                  "Dresses",
                  "Outerwear",
                  "Accessories",
                  "Shoes",
                ].includes(editingProduct.category) && (
                  <option value={editingProduct.category}>
                    {editingProduct.category}
                  </option>
                )}
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
            <select
              name="size"
              required
              defaultValue={editingProduct?.size ?? ""}
              className="form-input"
            >
              <option value="">Select</option>
              {editingProduct?.size &&
                !["XS", "S", "M", "L", "XL", "One size"].includes(
                  editingProduct.size,
                ) && (
                  <option value={editingProduct.size}>
                    {editingProduct.size}
                  </option>
                )}
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
            defaultValue={editingProduct?.condition ?? ""}
            className="form-input"
          >
            <option value="">Select condition</option>
            <option value="NEW">New</option>
            <option value="LIKE_NEW">Like new</option>
            <option value="GOOD">Very good</option>
            <option value="FAIR">Good</option>
          </select>
        </Field>

        <Field label="Listing price (Rp)">
          <input
            name="price"
            type="text"
            inputMode="numeric"
            required
            defaultValue={editingProduct?.price}
            placeholder="125.000"
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
                min={
                  editingProduct?.pickupDate &&
                  editingProduct.pickupDate <
                    new Date().toLocaleDateString("en-CA")
                    ? undefined
                    : new Date().toLocaleDateString("en-CA")
                }
                defaultValue={editingProduct?.pickupDate}
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
          disabled={
            submitting ||
            loadingProduct ||
            (Boolean(productId) &&
              (!editingProduct || editingProduct.status !== "AVAILABLE"))
          }
          className="h-12 w-full rounded-full bg-primary text-sm font-semibold text-white shadow-primary hover:bg-primary-dark disabled:opacity-60"
        >
          {submitting
            ? editingProduct
              ? "Saving…"
              : "Submitting…"
            : editingProduct
              ? "Save changes"
              : "Publish product"}
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
