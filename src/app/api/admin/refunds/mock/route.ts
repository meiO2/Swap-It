import { NextResponse } from "next/server";
import { requireRole } from "@/lib/authorization";
import { connectDB } from "@/lib/mongodb";
import Order from "@/models/Order";
import Payment from "@/models/Payment";
import Product from "@/models/Product";
import User from "@/models/User";

/** Development-only fixture that prepares an existing Uli order for QC testing. */
export async function POST() {
  const auth = await requireRole(["ADMIN"]);
  if (!auth.success) return auth.response;
  if (process.env.NODE_ENV === "production") return NextResponse.json({ success: false, message: "Demo data is disabled in production." }, { status: 403 });
  try {
    await connectDB();
    const buyer = await User.findOne({
      role: "CUSTOMER",
      isActive: true,
      $or: [
        { name: /^uli$/i },
        { email: /^uli(?:[+._-].*)?@/i },
      ],
    }).select("_id name email").lean();
    if (!buyer) return NextResponse.json({ success: false, message: "Create or activate the customer user Uli before creating the refund demo." }, { status: 409 });

    const orders = await Order.find({
      buyerId: buyer._id,
      status: { $nin: ["CANCELLED", "EXPIRED"] },
    }).sort({ createdAt: -1 }).limit(20);
    const order = orders.find((candidate) =>
      candidate.items.some((item) => item.qcStatus !== "BUYER_REJECTED"),
    );
    if (!order) return NextResponse.json({ success: false, message: "No usable existing order was found for Uli." }, { status: 409 });

    const item = order.items.find((candidate) => candidate.qcStatus !== "BUYER_REJECTED");
    if (!item) return NextResponse.json({ success: false, message: "No usable product was found in Uli's existing orders." }, { status: 409 });
    const product = await Product.findById(item.productId).select("name").lean();
    item.qcStatus = "FAILED_AWAITING_BUYER";
    item.buyerQcDecision = undefined;
    item.buyerQcDecisionAt = undefined;
    item.qcDecisionDeadline = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    await order.save();
    const payment = await Payment.findOne({ orderId: order._id, status: "PAID" }).select("_id").lean();
    return NextResponse.json({
      success: true,
      message: "Existing Uli order prepared for QC refund testing.",
      data: {
        orderId: String(order._id),
        buyer: { id: String(buyer._id), name: buyer.name, email: buyer.email },
        product: { id: String(item.productId), name: product?.name ?? item.name },
        productValue: item.price,
        paymentReady: Boolean(payment),
      },
    });
  } catch (error) { console.error("Create refund demo error:", error); return NextResponse.json({ success: false, message: "Could not create refund demo data." }, { status: 500 }); }
}
