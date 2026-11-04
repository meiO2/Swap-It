import mongoose from "mongoose";
import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/authorization";
import { connectDB } from "@/lib/mongodb";
import News from "@/models/News";

const fields = ["title", "date", "description", "image"] as const;

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["ADMIN"]);
  if (!auth.success) return auth.response;
  try {
    const { id } = await context.params;
    if (!mongoose.isValidObjectId(id)) return NextResponse.json({ success: false, message: "Invalid news ID." }, { status: 400 });
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null || Array.isArray(body)) return NextResponse.json({ success: false, message: "Provide valid news fields." }, { status: 400 });
    const input = body as Record<string, unknown>;
    const updates: Record<string, string | number> = {};
    for (const field of fields) {
      if (field in input) {
        if (typeof input[field] !== "string" || !(input[field] as string).trim()) return NextResponse.json({ success: false, message: `Enter a valid ${field}.` }, { status: 400 });
        updates[field] = (input[field] as string).trim();
      }
    }
    if (typeof updates.image === "string") {
      try {
        const imageUrl = new URL(updates.image);
        if (imageUrl.protocol !== "https:" && imageUrl.protocol !== "http:") throw new Error("Unsupported image protocol.");
      } catch {
        return NextResponse.json({ success: false, message: "Enter a valid HTTP or HTTPS image URL." }, { status: 400 });
      }
    }
    if (typeof updates.date === "string") {
      const newsDate = new Date(`${updates.date}T00:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(updates.date) || Number.isNaN(newsDate.getTime()) || newsDate.toISOString().slice(0, 10) !== updates.date) {
        return NextResponse.json({ success: false, message: "Enter a valid date in YYYY-MM-DD format." }, { status: 400 });
      }
    }
    if ("clothesDistributed" in input) {
      if (typeof input.clothesDistributed !== "number" || !Number.isInteger(input.clothesDistributed) || input.clothesDistributed < 0) return NextResponse.json({ success: false, message: "Enter a valid distributed-clothes count." }, { status: 400 });
      updates.clothesDistributed = input.clothesDistributed;
    }
    if ("status" in input) {
      if (input.status !== "draft" && input.status !== "published") return NextResponse.json({ success: false, message: "Choose draft or published." }, { status: 400 });
      updates.status = input.status;
    }
    if (!Object.keys(updates).length) return NextResponse.json({ success: false, message: "Provide at least one field to update." }, { status: 400 });
    await connectDB();
    const item = await News.findByIdAndUpdate(id, { $set: updates }, { new: true, runValidators: true });
    if (!item) return NextResponse.json({ success: false, message: "News item not found." }, { status: 404 });
    return NextResponse.json({ success: true, data: item });
  } catch (error) {
    console.error("Update news error:", error);
    return NextResponse.json({ success: false, message: "Could not update this news item." }, { status: 500 });
  }
}
