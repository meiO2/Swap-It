import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/authorization";
import { connectDB } from "@/lib/mongodb";
import News from "@/models/News";

const fields = ["title", "date", "description", "image"] as const;

export async function GET() {
  const auth = await requireRole(["ADMIN"]);
  if (!auth.success) return auth.response;
  try {
    await connectDB();
    const news = await News.find().sort({ createdAt: -1 }).lean();
    return NextResponse.json({ success: true, data: news });
  } catch (error) {
    console.error("Get admin news error:", error);
    return NextResponse.json({ success: false, message: "Could not load news." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(["ADMIN"]);
  if (!auth.success) return auth.response;
  try {
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null || Array.isArray(body)) return NextResponse.json({ success: false, message: "Provide valid news details." }, { status: 400 });
    const input = body as Record<string, unknown>;
    if (fields.some((field) => typeof input[field] !== "string" || !(input[field] as string).trim()) ||
        typeof input.clothesDistributed !== "number" || !Number.isInteger(input.clothesDistributed) || input.clothesDistributed < 0 ||
        (input.status !== undefined && !["draft", "published"].includes(String(input.status)))) {
      return NextResponse.json({ success: false, message: "Complete every news field with a valid value." }, { status: 400 });
    }
    try {
      const image = input.image as string;
      const isLocalUpload = image.startsWith("/uploads/");
      if (!isLocalUpload) {
        const imageUrl = new URL(image);
        if (imageUrl.protocol !== "https:" && imageUrl.protocol !== "http:") throw new Error("Unsupported image protocol.");
      }
      const newsDate = new Date(`${input.date as string}T00:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date as string) || Number.isNaN(newsDate.getTime()) || newsDate.toISOString().slice(0, 10) !== input.date) throw new Error("Invalid news date.");
    } catch {
      return NextResponse.json({ success: false, message: "Enter a valid date and an uploaded or HTTP(S) image URL." }, { status: 400 });
    }
    const status = input.status === "published" ? "published" : "draft";
    await connectDB();
    const item = await News.create({
      ...Object.fromEntries(fields.map((field) => [field, (input[field] as string).trim()])),
      clothesDistributed: input.clothesDistributed,
      status,
      authorId: auth.user.id,
    });
    return NextResponse.json({ success: true, data: item }, { status: 201 });
  } catch (error) {
    console.error("Create news error:", error);
    return NextResponse.json({ success: false, message: "Could not save this news item." }, { status: 500 });
  }
}
