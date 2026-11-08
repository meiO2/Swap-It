import { NextResponse } from "next/server";
import { requireRole } from "@/lib/authorization";
import { connectDB } from "@/lib/mongodb";
import Refund from "@/models/Refund";
import { serializeRefund } from "@/lib/refunds";
export async function GET() { const auth = await requireRole(["ADMIN", "INSPECTOR"]); if (!auth.success) return auth.response; try { await connectDB(); const refunds = await Refund.find().sort({ createdAt: -1 }).populate("orderId", "subtotal shippingFee serviceFee status").populate("userId", "name email").lean(); return NextResponse.json({ success: true, data: refunds.map((item) => serializeRefund(item)) }); } catch { return NextResponse.json({ success: false, message: "Could not load refund requests." }, { status: 500 }); } }
