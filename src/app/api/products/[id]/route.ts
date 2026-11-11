import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import { requireAuth } from "@/lib/authorization";
import Product from "@/models/Product";
import User from "@/models/User";
import { ensureMockDataSeeded } from "@/lib/mock-seed";
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
    await ensureMockDataSeeded();

    const product = await Product.findOne(
      validateId(id)
        ? { _id: id }
        : { mockId: id },
    )
      .populate("sellerId", "name")
      .lean();

    if (!product) {
      return NextResponse.json(
        { success: false, message: "Product not found." },
        { status: 404 },
      );
    }

    // Available products remain publicly accessible.
    if (product.status !== "AVAILABLE") {
      const auth = await requireAuth();

      if (!auth.success) return auth.response;

      const sellerId =
        typeof product.sellerId === "object" &&
        product.sellerId !== null &&
        "_id" in product.sellerId
          ? product.sellerId._id
          : product.sellerId;

      const isOwner = isProductOwner(
        sellerId,
        auth.user.id,
      );

      const isAdmin = auth.user.role === "ADMIN";

      if (!isOwner && !isAdmin) {
        return NextResponse.json(
          {
            success: false,
            message: "You do not have permission to view this product.",
          },
          { status: 403 },
        );
      }
    }

    return NextResponse.json({
      success: true,
      data: product,
    });
  } catch (error) {
    console.error("Get product error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Failed to retrieve product.",
      },
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

    if (permission.product.status !== "AVAILABLE") {
      return NextResponse.json(
        {
          success: false,
          message: "Only available listings can be edited.",
        },
        { status: 409 },
      );
    }

    const parsed = parseProductInput(await request.json(), true);
    if (parsed.error) {
      return NextResponse.json(
        { success: false, message: parsed.error },
        { status: 400 },
      );
    }
    const { pickupAddressId, ...productData } = parsed.data;
    const update: Record<string, unknown> = { ...productData };

    if (update.fulfillment === "Pickup") {
      if (
        !update.pickupDate &&
        (permission.product.fulfillment !== "Pickup" ||
          !permission.product.pickupDate)
      ) {
        return NextResponse.json(
          {
            success: false,
            message: "Please select a pickup date.",
          },
          { status: 400 },
        );
      }

      if (pickupAddressId) {
        const user = await User.findById(permission.auth.user.id)
          .select("addresses")
          .lean();
        const pickupAddress = user?.addresses?.find(
          (address) => address.id === pickupAddressId,
        );

        if (!pickupAddress) {
          return NextResponse.json(
            {
              success: false,
              message: "Please select a valid saved pickup address.",
            },
            { status: 400 },
          );
        }

        update.pickupAddress = pickupAddress;
      } else if (
        permission.product.fulfillment !== "Pickup" ||
        !permission.product.pickupAddress
      ) {
        return NextResponse.json(
          {
            success: false,
            message: "Please select a valid saved pickup address.",
          },
          { status: 400 },
        );
      }
    } else if (update.fulfillment === "Swap Hub drop-off") {
      update.pickupAddress = null;
      update.pickupDate = null;
    }

    const product = await Product.findOneAndUpdate(
      { _id: id, status: "AVAILABLE" },
      update,
      { new: true, runValidators: true },
    );
    if (!product) {
      return NextResponse.json(
        {
          success: false,
          message: "Only available listings can be edited.",
        },
        { status: 409 },
      );
    }

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
