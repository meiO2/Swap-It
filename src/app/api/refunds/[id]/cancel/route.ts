import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/authorization";
import { connectDB } from "@/lib/mongodb";
import Refund from "@/models/Refund";
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) { const auth = await requireAuth(); if (!auth.success) return auth.response; const { id } = await params; await connectDB(); const refund = await Refund.findOneAndUpdate({ _id: id, userId: auth.user.id, status: { $in: ["REQUESTED", "UNDER_REVIEW"] } }, { $set: { status: "CANCELLED" }, $push: { auditLog: { status: "CANCELLED", note: "Cancelled by buyer.", actorId: auth.user.id, at: new Date() } } }, { new: true }); return refund ? NextResponse.json({ success: true, data: { id: String(refund._id), status: refund.status } }) : NextResponse.json({ success: false, message: "This refund can no longer be cancelled." }, { status: 409 }); }
