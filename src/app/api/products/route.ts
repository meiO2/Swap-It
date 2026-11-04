import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import { requireAuth } from "@/lib/authorization";
import Product from "@/models/Product";
import {
  PRODUCT_CONDITIONS,
  parseProductInput,
} from "@/lib/products";

const SORTS = {
  price_asc: { price: 1 },
  price_desc: { price: -1 },
  newest: { publishedAt: -1 },
  oldest: { publishedAt: 1 },
} as const;

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const mine = searchParams.get("mine") === "true";
    const pageValue = Number.parseInt(searchParams.get("page") ?? "1", 10);
    const limitValue = Number.parseInt(searchParams.get("limit") ?? "20", 10);
    const page = Number.isFinite(pageValue) ? Math.max(pageValue, 1) : 1;
    const limit = Number.isFinite(limitValue)
      ? Math.min(Math.max(limitValue, 1), 50)
      : 20;
    const query: Record<string, unknown> = mine
      ? {}
      : { status: "AVAILABLE" };
    const search = searchParams.get("search")?.trim();
    const categoryId = searchParams.get("categoryId")?.trim();
    const size = searchParams.get("size")?.trim();
    const condition = searchParams.get("condition")?.trim();

    if (search) {
      query.name = { $regex: escapeRegex(search), $options: "i" };
    }
    if (categoryId) {
      if (!mongoose.Types.ObjectId.isValid(categoryId)) {
        return NextResponse.json(
          { success: false, message: "Invalid categoryId." },
          { status: 400 },
        );
      }
      query.categoryId = new mongoose.Types.ObjectId(categoryId);
    }
    if (size) query.size = size;
    if (condition) {
      if (!PRODUCT_CONDITIONS.includes(condition as (typeof PRODUCT_CONDITIONS)[number])) {
        return NextResponse.json(
          { success: false, message: "Invalid condition." },
          { status: 400 },
        );
      }
      query.condition = condition;
    }

    if (mine) {
      const auth = await requireAuth();
      if (!auth.success) return auth.response;
      query.sellerId = new mongoose.Types.ObjectId(auth.user.id);
    }

    const sortKey = searchParams.get("sort") ?? "newest";
    const sort = SORTS[sortKey as keyof typeof SORTS] ?? SORTS.newest;
    const [products, total] = await Promise.all([
      Product.find(query)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Product.countDocuments(query),
    ]);

    return NextResponse.json({
      success: true,
      data: products,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get products error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to retrieve products." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.success) return auth.response;

    const parsed = parseProductInput(await request.json());
    if (parsed.error) {
      return NextResponse.json(
        { success: false, message: parsed.error },
        { status: 400 },
      );
    }

    const status = parsed.data.status ?? "AVAILABLE";
    const product = await Product.create({
      ...parsed.data,
      sellerId: auth.user.id,
      status,
      publishedAt: status === "AVAILABLE" ? new Date() : null,
    });

    return NextResponse.json(
      { success: true, message: "Product created successfully.", data: product },
      { status: 201 },
    );
  } catch (error) {
    console.error("Create product error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to create product." },
      { status: 500 },
    );
  }
}
