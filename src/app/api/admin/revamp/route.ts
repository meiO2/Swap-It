import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/authorization";
import { connectDB } from "@/lib/mongodb";
import RevampMerchandise from "@/models/RevampMerchandise";

export async function GET() {
  const auth = await requireRole(["ADMIN"]);
  if (!auth.success) return auth.response;
  try {
    await connectDB();
    const products = await RevampMerchandise.find().sort({ createdAt: -1 }).lean();
    return NextResponse.json({ success: true, data: products });
  } catch (error) {
    console.error("Get Revamp merchandise error:", error);
    return NextResponse.json({ success: false, message: "Could not load Revamp merchandise." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(["ADMIN"]);
  if (!auth.success) return auth.response;
  try {
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return NextResponse.json({ success: false, message: "Provide valid merchandise details." }, { status: 400 });
    }
    const input = body as Record<string, unknown>;
    const fields = ["name", "category", "size", "condition", "description", "image"];
    if (fields.some((field) => typeof input[field] !== "string" || !(input[field] as string).trim()) ||
        typeof input.price !== "number" || !Number.isFinite(input.price) || input.price < 1 ||
        (input.status !== undefined && !["draft", "available", "archived"].includes(String(input.status)))) {
      return NextResponse.json({ success: false, message: "Complete each merchandise field with a valid value." }, { status: 400 });
    }
    try {
      const imageUrl = new URL(input.image as string);
      if (imageUrl.protocol !== "https:" && imageUrl.protocol !== "http:") throw new Error("Unsupported image protocol.");
    } catch {
      return NextResponse.json({ success: false, message: "Enter a valid HTTP or HTTPS image URL." }, { status: 400 });
    }
    const status = input.status === "available" || input.status === "archived" ? input.status : "draft";
    await connectDB();
    const product = await RevampMerchandise.create({
      ...Object.fromEntries(fields.map((field) => [field, (input[field] as string).trim()])),
      price: input.price,
      status,
      createdBy: auth.user.id,
    });
    return NextResponse.json({ success: true, data: product }, { status: 201 });
  } catch (error) {
    console.error("Create Revamp merchandise error:", error);
    return NextResponse.json({ success: false, message: "Could not create this merchandise item." }, { status: 500 });
  }
}
