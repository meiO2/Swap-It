
export const PRODUCT_CONDITIONS = [
  "NEW",
  "LIKE_NEW",
  "GOOD",
  "FAIR",
] as const;

export type ProductCondition = (typeof PRODUCT_CONDITIONS)[number];

export const PRODUCT_STATUSES = [
  "AVAILABLE",
  "RESERVED",
  "SOLD",
  "INACTIVE",
  "REVAMP_ELIGIBLE",
  "REVAMPED",
] as const;

export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const PRODUCT_FULFILLMENT = [
  "Swap Hub drop-off",
  "Pickup",
] as const;

export type ProductFulfillment =
  (typeof PRODUCT_FULFILLMENT)[number];

export type ProductInput = {
  name: string;
  description: string;
  category: string;
  price: number;
  size: string;
  condition: ProductCondition;
  images: string[];
  fulfillment: ProductFulfillment;
  pickupDate?: string;
  pickupAddressId?: string;
};

export type ApiProduct = {
  _id: string;
  name: string;
  category?: string;
  categoryId?: string;
  price: number;
  size: string;
  condition: ProductCondition;
  images: string[];
  sellerId: string;
};

const CONDITION_LABELS: Record<ProductCondition, string> = {
  NEW: "New",
  LIKE_NEW: "Like new",
  GOOD: "Good",
  FAIR: "Fair",
};

export function mapApiProduct(product: ApiProduct): MarketplaceProduct {
  return {
    id: product._id,
    name: product.name,
    category: product.category ?? product.categoryId ?? "Uncategorized",
    size: product.size,
    condition: CONDITION_LABELS[product.condition],
    gpPrice: product.price,
    price: product.price,
    image: product.images?.[0] ?? "/logo.png",
    imageAlt: product.name,
    seller: "SwapIt member",
    distance: "",
  };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeCondition(value: unknown): ProductCondition | null {
  if (typeof value !== "string") return null;

  const normalized = value.trim().toUpperCase().replace(/[\s-]+/g, "_");

  const aliases: Record<string, ProductCondition> = {
    NEW: "NEW",
    LIKE_NEW: "LIKE_NEW",
    VERY_GOOD: "GOOD",
    GOOD: "GOOD",
    FAIR: "FAIR",
  };

  return aliases[normalized] ?? null;
}

export function parseProductInput(
  body: unknown,
  partial = false,
): { data: Partial<ProductInput>; error?: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { data: {}, error: "Request body must be a JSON object." };
  }

  const input = body as Record<string, unknown>;
  const data: Partial<ProductInput> = {};

  // Accept the old seller form's "title" field as an alias for "name".
  const name = input.name ?? input.title;

  if (!partial || name !== undefined) {
    if (!isNonEmptyString(name)) {
      return { data: {}, error: "Product name is required." };
    }
    data.name = name.trim();
  }

  if (!partial || input.description !== undefined) {
    if (typeof input.description !== "string") {
      return { data: {}, error: "Product description is required." };
    }
    data.description = input.description.trim();
  }

  if (!partial || input.category !== undefined) {
    if (!isNonEmptyString(input.category)) {
      return { data: {}, error: "Product category is required." };
    }
    data.category = input.category.trim();
  }

  if (!partial || input.size !== undefined) {
    if (!isNonEmptyString(input.size)) {
      return { data: {}, error: "Product size is required." };
    }
    data.size = input.size.trim();
  }

  if (!partial || input.price !== undefined) {
    if (
      typeof input.price !== "number" ||
      !Number.isSafeInteger(input.price) ||
      input.price < 1
    ) {
      return {
        data: {},
        error: "Price must be an integer greater than zero.",
      };
    }
    data.price = input.price;
  }

  if (!partial || input.condition !== undefined) {
    const condition = normalizeCondition(input.condition);

    if (!condition) {
      return {
        data: {},
        error: "Choose a valid product condition.",
      };
    }

    data.condition = condition;
  }

  if (!partial || input.images !== undefined || input.image !== undefined) {
    // Support the old seller form's single optional image URL.
    const images =
      input.images !== undefined
        ? input.images
        : typeof input.image === "string" && input.image.trim()
          ? [input.image]
          : ["/logo.png"];

    if (
      !Array.isArray(images) ||
      images.length < 1 ||
      images.length > 8 ||
      images.some((image) => !isNonEmptyString(image))
    ) {
      return {
        data: {},
        error: "Provide between 1 and 8 valid product images.",
      };
    }

    data.images = images.map((image) => image.trim());
  }

  if (!partial || input.fulfillment !== undefined) {
    if (
      typeof input.fulfillment !== "string" ||
      !PRODUCT_FULFILLMENT.includes(
        input.fulfillment as ProductFulfillment,
      )
    ) {
      return {
        data: {},
        error: "Choose a valid handover method.",
      };
    }

    data.fulfillment = input.fulfillment as ProductFulfillment;
  }

  if (input.pickupDate !== undefined) {
    if (
      typeof input.pickupDate !== "string" ||
      !Number.isFinite(Date.parse(`${input.pickupDate}T23:59:59`)) ||
      Date.parse(`${input.pickupDate}T23:59:59`) < Date.now()
    ) {
      return {
        data: {},
        error: "Choose a valid future pickup date.",
      };
    }

    data.pickupDate = input.pickupDate;
  }

  if (input.pickupAddressId !== undefined) {
    if (!isNonEmptyString(input.pickupAddressId)) {
      return {
        data: {},
        error: "Choose a valid saved pickup address.",
      };
    }

    data.pickupAddressId = input.pickupAddressId.trim();
  }

  if (data.fulfillment === "Pickup" || input.fulfillment === "Pickup") {
    const hasExistingAddress =
      partial && input.pickupAddressId === undefined;

    if (!hasExistingAddress && !data.pickupAddressId) {
      return {
        data: {},
        error: "Choose a saved pickup address.",
      };
    }

    if (!data.pickupDate && !partial) {
      return {
        data: {},
        error: "Choose a pickup date.",
      };
    }
  }

  return { data };
}

export function isProductOwner(
  sellerId: { toString(): string },
  userId: string,
) {
  return sellerId.toString() === userId;
}
import type { Product as MarketplaceProduct } from "@/data/mock";
