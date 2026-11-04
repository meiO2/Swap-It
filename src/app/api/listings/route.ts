import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/authorization";
import { connectDB } from "@/lib/mongodb";
import Listing from "@/models/Listing";
import User from "@/models/User";
import type { IUserAddress } from "@/models/User";

export async function GET() {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;
  try {
    await connectDB();
    const listings = await Listing.find({ sellerId: auth.user.id }).sort({ createdAt: -1 }).lean();
    return NextResponse.json({ success: true, data: listings.map((item) => ({ ...item, id: String(item._id) })) });
  } catch (error) {
    console.error("Get listings error:", error);
    return NextResponse.json({ success: false, message: "Could not load your listings." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;
  try {
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null || Array.isArray(body)) return NextResponse.json({ success: false, message: "Provide valid listing details." }, { status: 400 });
    const input = body as Record<string, unknown>;
    const textFields = ["title", "category", "size", "condition"] as const;
    if (textFields.some((field) => typeof input[field] !== "string" || !(input[field] as string).trim()) ||
        typeof input.price !== "number" || !Number.isFinite(input.price) || input.price < 1 ||
        (input.fulfillment !== "Swap Hub drop-off" && input.fulfillment !== "Pickup") ||
        (input.image !== undefined && (typeof input.image !== "string" || input.image.length > 2000000))) {
      return NextResponse.json({ success: false, message: "Complete every required listing field with valid values." }, { status: 400 });
    }
    if (typeof input.image === "string" && input.image.trim()) {
      try {
        const imageUrl = new URL(input.image.trim());
        if (imageUrl.protocol !== "https:" && imageUrl.protocol !== "http:") throw new Error("Unsupported image protocol.");
      } catch {
        return NextResponse.json({ success: false, message: "Enter a valid HTTP or HTTPS image URL." }, { status: 400 });
      }
    }
    if (input.fulfillment === "Pickup" && (typeof input.pickupDate !== "string" || !Number.isFinite(Date.parse(`${input.pickupDate}T23:59:59`)) || Date.parse(`${input.pickupDate}T23:59:59`) < Date.now())) {
      return NextResponse.json({ success: false, message: "Choose a future pickup date." }, { status: 400 });
    }
    const pickupAddressInput = input.pickupAddress as { id?: unknown } | undefined;
    if (input.fulfillment === "Pickup" && (typeof pickupAddressInput?.id !== "string" || !pickupAddressInput.id)) {
      return NextResponse.json({ success: false, message: "Choose a saved pickup address." }, { status: 400 });
    }
    await connectDB();
    let pickupAddress: IUserAddress | undefined;
    if (input.fulfillment === "Pickup") {
      const user = await User.findById(auth.user.id).select("addresses").lean();
      pickupAddress = user?.addresses.find((address) => address.id === pickupAddressInput?.id);
      if (!pickupAddress) return NextResponse.json({ success: false, message: "Choose a valid saved pickup address." }, { status: 400 });
    }
    const listing = await Listing.create({
      sellerId: auth.user.id,
      ...Object.fromEntries(textFields.map((field) => [field, (input[field] as string).trim()])),
      ...(typeof input.description === "string" ? { description: input.description.trim() } : {}),
      ...(typeof input.image === "string" && input.image.trim() ? { image: input.image.trim() } : {}),
      price: input.price,
      fulfillment: input.fulfillment,
      ...(typeof input.pickupDate === "string" ? { pickupDate: input.pickupDate } : {}),
      ...(pickupAddress ? { pickupAddress } : {}),
    });
    return NextResponse.json({ success: true, data: { ...listing.toObject(), id: String(listing._id) } }, { status: 201 });
  } catch (error) {
    console.error("Create listing error:", error);
    return NextResponse.json({ success: false, message: "Could not submit this listing." }, { status: 500 });
  }
}
