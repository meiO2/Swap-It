import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { requireAuth } from "@/lib/authorization";
import User from "@/models/User";

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;
  try {
    const { id } = await context.params;
    await connectDB();
    const result = await User.updateOne({ _id: auth.user.id }, { $pull: { addresses: { id } } });
    if (!result.modifiedCount) return NextResponse.json({ success: false, message: "Address not found." }, { status: 404 });
    return NextResponse.json({ success: true, data: { id } });
  } catch (error) {
    console.error("Delete address error:", error);
    return NextResponse.json({ success: false, message: "Could not delete this address." }, { status: 500 });
  }
}
