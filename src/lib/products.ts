import mongoose from "mongoose";

export const PRODUCT_CONDITIONS = ["NEW", "LIKE_NEW", "GOOD", "FAIR"] as const;
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

export type ProductInput = {
  name: string;
  description: string;
  categoryId: string;
  brand?: string;
  price: number;
  size: string;
  condition: ProductCondition;
  images: string[];
  status?: ProductStatus;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
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

  const requiredStrings = ["name", "description", "size"] as const;
  for (const field of requiredStrings) {
    if (!(field in input) && partial) continue;
    if (!isNonEmptyString(input[field])) {
      return { data: {}, error: `${field} is required.` };
    }
    data[field] = input[field].trim();
  }

  if (!("categoryId" in input) && partial) {
    // Keep the existing category when updating other fields.
  } else if (
    !isNonEmptyString(input.categoryId) ||
    !mongoose.Types.ObjectId.isValid(input.categoryId)
  ) {
    return { data: {}, error: "categoryId must be a valid category ID." };
  } else {
    data.categoryId = input.categoryId;
  }

  if ("brand" in input || !partial) {
    if (input.brand !== undefined && typeof input.brand !== "string") {
      return { data: {}, error: "brand must be a string." };
    }
    data.brand =
      typeof input.brand === "string" ? input.brand.trim() : undefined;
  }

  if (!("price" in input) && partial) {
    // Keep the existing price when updating other fields.
  } else if (
    typeof input.price !== "number" ||
    !Number.isSafeInteger(input.price) ||
    input.price < 1
  ) {
    return { data: {}, error: "price must be an integer greater than zero." };
  } else {
    data.price = input.price;
  }

  if (!("condition" in input) && partial) {
    // Keep the existing condition when updating other fields.
  } else if (
    typeof input.condition !== "string" ||
    !PRODUCT_CONDITIONS.includes(input.condition as ProductCondition)
  ) {
    return {
      data: {},
      error: `condition must be one of: ${PRODUCT_CONDITIONS.join(", ")}.`,
    };
  } else {
    data.condition = input.condition as ProductCondition;
  }

  if (!("images" in input) && partial) {
    // Keep the existing images when updating other fields.
  } else if (
    !Array.isArray(input.images) ||
    input.images.length < 1 ||
    input.images.length > 8 ||
    input.images.some((image) => !isNonEmptyString(image))
  ) {
    return {
      data: {},
      error: "images must contain between 1 and 8 non-empty strings.",
    };
  } else {
    data.images = input.images.map((image) => image.trim());
  }

  if ("status" in input) {
    if (
      typeof input.status !== "string" ||
      !PRODUCT_STATUSES.includes(input.status as ProductStatus)
    ) {
      return {
        data: {},
        error: `status must be one of: ${PRODUCT_STATUSES.join(", ")}.`,
      };
    }
    data.status = input.status as ProductStatus;
  }

  return { data };
}

export function isProductOwner(
  sellerId: mongoose.Types.ObjectId,
  userId: string,
) {
  return sellerId.toString() === userId;
}
