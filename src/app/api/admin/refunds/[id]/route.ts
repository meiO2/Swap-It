import { NextResponse } from "next/server";
import { requireRole } from "@/lib/authorization";
import { connectDB } from "@/lib/mongodb";
import Refund from "@/models/Refund";
import RefundTransaction from "@/models/RefundTransaction";
import { serializeRefund } from "@/lib/refunds";
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) { const auth = await requireRole(["ADMIN", "INSPECTOR"]); if (!auth.success) return auth.response; const { id } = await params; await connectDB(); const refund = await Refund.findById(id).populate("orderId").populate("userId", "name email").lean(); if (!refund) return NextResponse.json({ success: false, message: "Refund not found." }, { status: 404 }); const transactions = await RefundTransaction.find({ refundId: id }).lean(); return NextResponse.json({ success: true, data: { ...serializeRefund(refund), transactions } }); }
