import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import { requireAuth } from "@/lib/authorization";
import Product from "@/models/Product";
import {
  isProductOwner,
  parseProductInput,
  type ProductStatus,
} from "@/lib/products";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function validateId(id: string) {
  return mongoose.Types.ObjectId.isValid(id);
}

async function canManageProduct(id: string) {
  const auth = await requireAuth();
  if (!auth.success) return auth;

  const product = await Product.findById(id);
  if (!product) {
    return {
      success: false as const,
      response: NextResponse.json(
        { success: false, message: "Product not found." },
        { status: 404 },
      ),
    };
  }

  if (
    auth.user.role !== "ADMIN" &&
    !isProductOwner(product.sellerId, auth.user.id)
  ) {
    return {
      success: false as const,
      response: NextResponse.json(
        { success: false, message: "Forbidden. You do not own this product." },
        { status: 403 },
      ),
    };
  }

  return { success: true as const, auth, product };
}

export async function GET(
  _request: NextRequest,
  { params }: RouteContext,
) {
  try {
    await connectDB();
    const { id } = await params;
    if (!validateId(id)) {
      return NextResponse.json(
        { success: false, message: "Invalid product ID." },
        { status: 400 },
      );
    }

    const product = await Product.findOne({
      _id: id,
      status: "AVAILABLE",
    })
      .populate("sellerId", "name")
      .lean();
    if (!product) {
      return NextResponse.json(
        { success: false, message: "Product not found." },
        { status: 404 },
      );
    }
    return NextResponse.json({ success: true, data: product });
  } catch (error) {
    console.error("Get product error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to retrieve product." },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: RouteContext,
) {
  try {
    await connectDB();
    const { id } = await params;
    if (!validateId(id)) {
      return NextResponse.json(
        { success: false, message: "Invalid product ID." },
        { status: 400 },
      );
    }

    const permission = await canManageProduct(id);
    if (!permission.success) return permission.response;

    const parsed = parseProductInput(await request.json(), true);
    if (parsed.error) {
      return NextResponse.json(
        { success: false, message: parsed.error },
        { status: 400 },
      );
    }
    const update: Record<string, unknown> = { ...parsed.data };
    if (update.status === "AVAILABLE" && permission.product.status !== "AVAILABLE") {
      update.publishedAt = new Date();
    } else if (
      update.status &&
      update.status !== "AVAILABLE" &&
      permission.product.status === "AVAILABLE"
    ) {
      update.publishedAt = null;
    }

    const product = await Product.findByIdAndUpdate(id, update, {
      new: true,
      runValidators: true,
    });
    return NextResponse.json({
      success: true,
      message: "Product updated successfully.",
      data: product,
    });
  } catch (error) {
    console.error("Update product error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update product." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: RouteContext,
) {
  try {
    await connectDB();
    const { id } = await params;
    if (!validateId(id)) {
      return NextResponse.json(
        { success: false, message: "Invalid product ID." },
        { status: 400 },
      );
    }

    const permission = await canManageProduct(id);
    if (!permission.success) return permission.response;

    await Product.findByIdAndUpdate(id, {
      status: "INACTIVE" satisfies ProductStatus,
      publishedAt: null,
    });
    return NextResponse.json({
      success: true,
      message: "Product deactivated successfully.",
    });
  } catch (error) {
    console.error("Archive product error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to archive product." },
      { status: 500 },
    );
  }
}
