import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/authorization";
import { connectDB } from "@/lib/mongodb";
import Refund from "@/models/Refund";
import RefundTransaction from "@/models/RefundTransaction";
import { serializeRefund } from "@/lib/refunds";
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) { const auth = await requireAuth(); if (!auth.success) return auth.response; const { id } = await params; await connectDB(); const refund = await Refund.findOne({ _id: id, userId: auth.user.id }).lean(); if (!refund) return NextResponse.json({ success: false, message: "Refund not found." }, { status: 404 }); const transactions = await RefundTransaction.find({ refundId: refund._id }).lean(); return NextResponse.json({ success: true, data: { ...serializeRefund(refund), transactions: transactions.map((item) => ({ ...item, id: String(item._id), refundId: String(item.refundId), orderId: String(item.orderId) })) } }); }
