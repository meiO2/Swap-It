
    import { NextResponse } from "next/server";
    import mongoose from "mongoose";
    import { requireAuth } from "@/lib/authorization";
    import { connectDB } from "@/lib/mongodb";
    import Order from "@/models/Order";

    export async function GET() {
    try {
        const auth = await requireAuth();
        if (!auth.success) return auth.response;

        await connectDB();

        const sellerId = new mongoose.Types.ObjectId(auth.user.id);

        const orders = await Order.find({
        "items.sellerId": sellerId,
        status: { $in: ["PAID", "AWAITING_SELLER_HANDOVER", "PROCESSING"] },
        })
        .sort({ createdAt: -1 })
        .lean();

        const handovers = orders.flatMap((order) => {
        const sellerItems = order.items
            .filter(
            (item) =>
                item.sellerId.toString() === auth.user.id &&
                item.handover &&
                [
                "AWAITING_PAYMENT",
                "AWAITING_SELLER_SCHEDULE",
                "SCHEDULED",
                ].includes(item.handover.status)
            )
            .map((item) => ({
            productId: item.productId.toString(),
            name: item.name,
            price: item.price,
            image: item.image ?? null,
            handover: item.handover,
            }));

        return sellerItems.map((item) => ({
            orderId: order._id.toString(),
            orderStatus: order.status,
            createdAt: order.createdAt,
            item,
        }));
        });

        return NextResponse.json({
        success: true,
        data: handovers,
        });
    } catch (error) {
        console.error("Get seller handovers error:", error);

        return NextResponse.json(
        {
            success: false,
            message: "Failed to retrieve seller handovers.",
        },
        { status: 500 },
        );
    }
    }
