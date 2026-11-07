
    import mongoose from "mongoose";
    import { NextRequest, NextResponse } from "next/server";

    import { requireAuth } from "@/lib/authorization";
    import { connectDB } from "@/lib/mongodb";
    import Order from "@/models/Order";

    type RouteContext = {
    params: Promise<{ id: string }>;
    };

    export async function POST(
    request: NextRequest,
    context: RouteContext,
    ) {
    try {
        const auth = await requireAuth();

        if (!auth.success) {
        return auth.response;
        }

        const { id } = await context.params;

        if (!mongoose.isValidObjectId(id)) {
        return NextResponse.json(
            { success: false, message: "Invalid order ID." },
            { status: 400 },
        );
        }

        const body: unknown = await request.json();

        if (
        typeof body !== "object" ||
        body === null ||
        Array.isArray(body)
        ) {
        return NextResponse.json(
            { success: false, message: "Invalid request body." },
            { status: 400 },
        );
        }

        const input = body as Record<string, unknown>;

        if (
        typeof input.productId !== "string" ||
        !mongoose.isValidObjectId(input.productId) ||
        (input.decision !== "ACCEPT" && input.decision !== "REJECT")
        ) {
        return NextResponse.json(
            {
            success: false,
            message: "Valid productId and decision are required.",
            },
            { status: 400 },
        );
        }

        await connectDB();

        const order = await Order.findOne({
        _id: id,
        buyerId: new mongoose.Types.ObjectId(auth.user.id),
        });

        if (!order) {
        return NextResponse.json(
            { success: false, message: "Order not found." },
            { status: 404 },
        );
        }

        const item = order.items.find(
        (entry) =>
            entry.productId.toString() === input.productId,
        );

        if (!item) {
        return NextResponse.json(
            { success: false, message: "Product not found in this order." },
            { status: 404 },
        );
        }

        if (item.qcStatus !== "FAILED_AWAITING_BUYER") {
        return NextResponse.json(
            {
            success: false,
            message: "This product is not awaiting a buyer decision.",
            },
            { status: 409 },
        );
        }

        if (
        !item.qcDecisionDeadline ||
        new Date() > new Date(item.qcDecisionDeadline)
        ) {
        return NextResponse.json(
            {
            success: false,
            message: "The buyer decision deadline has expired.",
            },
            { status: 410 },
        );
        }

        item.buyerQcDecision = input.decision;
        item.buyerQcDecisionAt = new Date();

        if (input.decision === "ACCEPT") {
        item.qcStatus = "BUYER_ACCEPTED";
        } else {
        item.qcStatus = "BUYER_REJECTED";
        }

        await order.save();

        return NextResponse.json({
        success: true,
        message:
            input.decision === "ACCEPT"
            ? "You accepted the product. It can proceed to shipping."
            : "Your rejection has been recorded. The refund workflow must now be coordinated.",
        data: {
            orderId: order._id.toString(),
            productId: item.productId.toString(),
            decision: item.buyerQcDecision,
            qcStatus: item.qcStatus,
            refundRequired: input.decision === "REJECT",
            refundAmount:
            input.decision === "REJECT" ? item.price : 0,
        },
        });
    } catch (error) {
        console.error("Buyer QC decision error:", error);

        return NextResponse.json(
        {
            success: false,
            message: "Could not save your QC decision.",
        },
        { status: 500 },
        );
    }
    }
