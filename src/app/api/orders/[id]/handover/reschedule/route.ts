
    import { NextRequest, NextResponse } from "next/server";
    import mongoose from "mongoose";
    import { requireAuth } from "@/lib/authorization";
    import { connectDB } from "@/lib/mongodb";
    import Order from "@/models/Order";

    type RouteContext = {
    params: Promise<{ id: string }>;
    };

    export async function PATCH(
    request: NextRequest,
    { params }: RouteContext,
    ) {
    try {
        const auth = await requireAuth();
        if (!auth.success) return auth.response;

        const { id } = await params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
        return NextResponse.json(
            { success: false, message: "Invalid order ID." },
            { status: 400 },
        );
        }

        const body: unknown = await request.json();

        if (!body || typeof body !== "object" || Array.isArray(body)) {
        return NextResponse.json(
            { success: false, message: "Invalid rescheduling information." },
            { status: 400 },
        );
        }

        const input = body as Record<string, unknown>;

        if (
        typeof input.productId !== "string" ||
        !mongoose.Types.ObjectId.isValid(input.productId)
        ) {
        return NextResponse.json(
            { success: false, message: "A valid productId is required." },
            { status: 400 },
        );
        }

        if (typeof input.scheduledAt !== "string") {
        return NextResponse.json(
            { success: false, message: "A new scheduling date is required." },
            { status: 400 },
        );
        }

        const newScheduledAt = new Date(input.scheduledAt);

        if (
        Number.isNaN(newScheduledAt.getTime()) ||
        newScheduledAt.getTime() <= Date.now()
        ) {
        return NextResponse.json(
            {
            success: false,
            message: "The new scheduled date must be in the future.",
            },
            { status: 400 },
        );
        }

        await connectDB();

        const order = await Order.findOne({
        _id: id,
        "items.productId": input.productId,
        "items.sellerId": auth.user.id,
        });

        if (!order) {
        return NextResponse.json(
            {
            success: false,
            message: "Order or seller-owned product not found.",
            },
            { status: 404 },
        );
        }

        const item = order.items.find(
        (entry) =>
            entry.productId.toString() === input.productId &&
            entry.sellerId.toString() === auth.user.id,
        );

        if (!item || !item.handover) {
        return NextResponse.json(
            {
            success: false,
            message: "Handover information is unavailable.",
            },
            { status: 409 },
        );
        }

        const handover = item.handover;

        if (!["PAID", "AWAITING_SELLER_HANDOVER", "PROCESSING"].includes(order.status)) {
        return NextResponse.json(
            {
            success: false,
            message: "This order cannot be rescheduled.",
            },
            { status: 409 },
        );
        }

        if (handover.status !== "SCHEDULED" || !handover.scheduledAt) {
        return NextResponse.json(
            {
            success: false,
            message: "Only scheduled handovers can be rescheduled.",
            },
            { status: 409 },
        );
        }

        const rescheduleCount = handover.rescheduleCount ?? 0;

        if (rescheduleCount >= 1) {
        return NextResponse.json(
            {
            success: false,
            message: "This handover has already been rescheduled once.",
            },
            { status: 409 },
        );
        }

        const now = new Date();
        const originalScheduledAt = new Date(handover.scheduledAt);

        const hoursUntilSchedule =
        originalScheduledAt.getTime() - now.getTime();

        const H24 = 24 * 60 * 60 * 1000;

        if (hoursUntilSchedule < H24) {
        return NextResponse.json(
            {
            success: false,
            message:
                "Rescheduling is only allowed at least 24 hours before the original schedule.",
            },
            { status: 409 },
        );
        }

        if (newScheduledAt.getTime() === originalScheduledAt.getTime()) {
        return NextResponse.json(
            {
            success: false,
            message: "The new schedule must differ from the original schedule.",
            },
            { status: 400 },
        );
        }

        handover.rescheduleHistory = handover.rescheduleHistory ?? [];

        handover.rescheduleHistory.push({
        previousScheduledAt: originalScheduledAt,
        newScheduledAt,
        changedAt: now,
        changedBy: new mongoose.Types.ObjectId(auth.user.id),
        });

        handover.scheduledAt = newScheduledAt;
        handover.rescheduleCount = rescheduleCount + 1;

        await order.save();

        return NextResponse.json(
        {
            success: true,
            message: "Handover rescheduled successfully.",
            data: {
            orderId: order._id,
            productId: input.productId,
            handover: handover,
            },
        },
        { status: 200 },
        );
    } catch (error) {
        console.error("Reschedule handover error:", error);

        return NextResponse.json(
        {
            success: false,
            message: "Failed to reschedule handover.",
        },
        { status: 500 },
        );
    }
    }
