import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { requireAuth } from "@/lib/authorization";
import { connectDB } from "@/lib/mongodb";
import Cart from "@/models/Cart";
import Product from "@/models/Product";

function invalidProductId() {
  return NextResponse.json(
    { success: false, message: "Invalid productId." },
    { status: 400 },
  );
}

export async function GET() {
  try {
    const auth = await requireAuth();
    if (!auth.success) return auth.response;
    await connectDB();

    const cart = await Cart.findOne({ userId: auth.user.id })
      .populate({
        path: "items.productId",
        select: "sellerId name price size condition images status",
      })
      .lean();
    const items = (cart?.items ?? []).filter(
      (item) =>
        item.productId &&
        typeof item.productId === "object" &&
        "price" in item.productId,
    );
    const subtotal = items.reduce((total, item) => {
      const product = item.productId as unknown as { price: number };
      return total + product.price;
    }, 0);

    return NextResponse.json({
      success: true,
      data: {
        items,
        itemCount: items.length,
        subtotal,
      },
    });
  } catch (error) {
    console.error("Get cart error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to retrieve cart." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.success) return auth.response;
    await connectDB();

    const body = await request.json();
    const productId = body?.productId;
    if (
      typeof productId !== "string" ||
      !mongoose.Types.ObjectId.isValid(productId)
    ) {
      return invalidProductId();
    }

    const product = await Product.findOne({
      _id: productId,
      status: "AVAILABLE",
    });
    if (!product) {
      return NextResponse.json(
        { success: false, message: "Product is not available." },
        { status: 409 },
      );
    }
    if (product.sellerId.toString() === auth.user.id) {
      return NextResponse.json(
        { success: false, message: "You cannot add your own product to cart." },
        { status: 403 },
      );
    }

    let cart = await Cart.findOne({ userId: auth.user.id });
    if (!cart) {
      cart = await Cart.create({
        userId: auth.user.id,
        items: [{ productId: new mongoose.Types.ObjectId(productId), addedAt: new Date() }],
      });
    } else if (
      cart.items.some((item) => item.productId.toString() === productId)
    ) {
      return NextResponse.json(
        { success: false, message: "Product is already in your cart." },
        { status: 409 },
      );
    } else {
      cart.items.push({
        productId: new mongoose.Types.ObjectId(productId),
        addedAt: new Date(),
      });
      await cart.save();
    }

    return NextResponse.json(
      { success: true, message: "Product added to cart.", data: cart },
      { status: 201 },
    );
  } catch (error) {
    console.error("Add to cart error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to add product to cart." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.success) return auth.response;
    await connectDB();

    const body = await request.json();
    const productId = body?.productId;
    if (
      typeof productId !== "string" ||
      !mongoose.Types.ObjectId.isValid(productId)
    ) {
      return invalidProductId();
    }

    const cart = await Cart.findOneAndUpdate(
      { userId: auth.user.id },
      { $pull: { items: { productId } } },
      { new: true },
    );
    if (!cart) {
      return NextResponse.json(
        { success: false, message: "Cart not found." },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "Product removed from cart.",
      data: cart,
    });
  } catch (error) {
    console.error("Remove from cart error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to remove product from cart." },
      { status: 500 },
    );
  }
}
