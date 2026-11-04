import mongoose from "mongoose";
import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/authorization";
import { connectDB } from "@/lib/mongodb";
import RevampMerchandise from "@/models/RevampMerchandise";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["ADMIN"]);
  if (!auth.success) return auth.response;
  try {
    const { id } = await context.params;
    if (!mongoose.isValidObjectId(id)) return NextResponse.json({ success: false, message: "Invalid merchandise ID." }, { status: 400 });
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null || Array.isArray(body) || !["draft", "available", "archived"].includes(String((body as Record<string, unknown>).status))) {
      return NextResponse.json({ success: false, message: "Choose a valid merchandise management status." }, { status: 400 });
    }
    await connectDB();
    const product = await RevampMerchandise.findByIdAndUpdate(id, { status: (body as { status: string }).status }, { new: true, runValidators: true });
    if (!product) return NextResponse.json({ success: false, message: "Merchandise item not found." }, { status: 404 });
    return NextResponse.json({ success: true, data: product });
  } catch (error) {
    console.error("Update Revamp merchandise error:", error);
    return NextResponse.json({ success: false, message: "Could not update this merchandise item." }, { status: 500 });
  }
}
