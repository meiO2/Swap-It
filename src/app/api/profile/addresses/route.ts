import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { connectDB } from "@/lib/mongodb";
import { requireAuth } from "@/lib/authorization";
import User from "@/models/User";

function validAddress(value: Record<string, unknown>) {
  return ["name", "phone", "address", "city", "postalCode"].every((key) =>
    typeof value[key] === "string" && String(value[key]).trim().length > 0 && String(value[key]).length <= 300,
  );
}

export async function GET() {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;
  try {
    await connectDB();
    const user = await User.findById(auth.user.id).select("addresses").lean();
    return NextResponse.json({ success: true, data: user?.addresses ?? [] });
  } catch (error) {
    console.error("Get addresses error:", error);
    return NextResponse.json({ success: false, message: "Could not load saved addresses." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;
  try {
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return NextResponse.json({ success: false, message: "Complete every address field with a valid value." }, { status: 400 });
    }
    const addressInput = body as Record<string, unknown>;
    if (!validAddress(addressInput)) {
      return NextResponse.json({ success: false, message: "Complete every address field with a valid value." }, { status: 400 });
    }
    const address = {
      id: randomUUID(),
      name: String(addressInput.name).trim(),
      phone: String(addressInput.phone).trim(),
      address: String(addressInput.address).trim(),
      city: String(addressInput.city).trim(),
      postalCode: String(addressInput.postalCode).trim(),
    };
    await connectDB();
    await User.findByIdAndUpdate(auth.user.id, { $push: { addresses: address } }, { runValidators: true });
    return NextResponse.json({ success: true, data: address }, { status: 201 });
  } catch (error) {
    console.error("Save address error:", error);
    return NextResponse.json({ success: false, message: "Could not save this address." }, { status: 500 });
  }
}
