import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/authorization";
import { connectDB } from "@/lib/mongodb";
import Refund from "@/models/Refund";
import { isUploadedImageUrl } from "@/lib/image-urls";
import { getRefundableOrder, isRefundEligible, serializeRefund, validReason } from "@/lib/refunds";

export async function GET() { try { const auth = await requireAuth(); if (!auth.success) return auth.response; await connectDB(); const refunds = await Refund.find({ userId: auth.user.id }).sort({ createdAt: -1 }).lean(); return NextResponse.json({ success: true, data: refunds.map((item) => serializeRefund(item)) }); } catch { return NextResponse.json({ success: false, message: "Could not load refunds." }, { status: 500 }); } }
export async function POST(request: NextRequest) { try {
  const auth = await requireAuth(); if (!auth.success) return auth.response; const body = await request.json();
  if (!body || typeof body !== "object" || !validReason(body.reason) || typeof body.orderId !== "string" || typeof body.description !== "string" || body.description.trim().length < 5) return NextResponse.json({ success: false, message: "Order, valid reason, and a description of at least 5 characters are required." }, { status: 400 });
  const evidence = body.evidence === undefined
    ? []
    : Array.isArray(body.evidence) && body.evidence.length <= 8 && body.evidence.every((item: unknown) => typeof item === "string" && isUploadedImageUrl(item))
      ? body.evidence as string[]
      : null;
  if (evidence === null) return NextResponse.json({ success: false, message: "Evidence must contain up to 8 uploaded photos." }, { status: 400 });
  await connectDB(); const order = await getRefundableOrder(body.orderId, auth.user.id);
  if (!order) return NextResponse.json({ success: false, message: "Order not found." }, { status: 404 });
  if (!isRefundEligible(order.status)) return NextResponse.json({ success: false, message: "This order is not eligible for a refund request." }, { status: 409 });
  const active = await Refund.exists({ orderId: order._id, status: { $in: ["REQUESTED", "UNDER_REVIEW", "APPROVED", "PROCESSING", "PARTIALLY_COMPLETED"] } });
  if (active) return NextResponse.json({ success: false, message: "An active refund request already exists for this order." }, { status: 409 });
  const refund = await Refund.create({ orderId: order._id, userId: auth.user.id, reason: body.reason, description: body.description.trim(), evidence, status: "REQUESTED", auditLog: [{ status: "REQUESTED", note: "Refund request submitted by buyer.", actorId: auth.user.id, at: new Date() }] });
  return NextResponse.json({ success: true, message: "Refund request submitted successfully.", data: serializeRefund(refund.toObject()) }, { status: 201 });
} catch { return NextResponse.json({ success: false, message: "Could not submit refund request." }, { status: 500 }); } }
