import { NextResponse, type NextRequest } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { requireAuth } from "@/lib/authorization";
import User from "@/models/User";

export async function GET() {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;
  try {
    await connectDB();
    const user = await User.findById(auth.user.id).select("name email role phone avatarUrl addresses createdAt").lean();
    if (!user) return NextResponse.json({ success: false, message: "Account not found." }, { status: 404 });
    return NextResponse.json({ success: true, data: user });
  } catch (error) {
    console.error("Get profile error:", error);
    return NextResponse.json({ success: false, message: "Could not load your profile." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;
  try {
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return NextResponse.json({ success: false, message: "Provide valid profile fields." }, { status: 400 });
    }
    const input = body as Record<string, unknown>;
    const updates: Record<string, string> = {};
    for (const field of ["name", "phone"] as const) {
      if (field in input) {
        if (typeof input[field] !== "string" || input[field].trim().length > (field === "name" ? 100 : 30)) {
          return NextResponse.json({ success: false, message: `Enter a valid ${field}.` }, { status: 400 });
        }
        updates[field] = input[field].trim();
      }
    }
    if (!Object.keys(updates).length || ("name" in updates && !updates.name)) {
      return NextResponse.json({ success: false, message: "Provide a non-empty name or phone number." }, { status: 400 });
    }
    await connectDB();
    const user = await User.findByIdAndUpdate(auth.user.id, { $set: updates }, {
      new: true,
      runValidators: true,
      select: "name email role phone avatarUrl addresses createdAt",
    }).lean();
    if (!user) return NextResponse.json({ success: false, message: "Account not found." }, { status: 404 });
    return NextResponse.json({ success: true, data: user });
  } catch (error) {
    console.error("Update profile error:", error);
    return NextResponse.json({ success: false, message: "Could not save your profile." }, { status: 500 });
  }
}
