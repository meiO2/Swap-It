
    import { NextRequest, NextResponse } from "next/server";
    import mongoose from "mongoose";
    import { requireAuth } from "@/lib/authorization";
    import { connectDB } from "@/lib/mongodb";
    import Order from "@/models/Order";
    import { swapHubs } from "@/data/mock";
    import { createNotification } from "@/lib/notifications";

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
            { success: false, message: "Invalid scheduling information." },
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
            { success: false, message: "A scheduling date is required." },
            { status: 400 },
        );
        }

        const scheduledAt = new Date(input.scheduledAt);

        if (
        Number.isNaN(scheduledAt.getTime()) ||
        scheduledAt.getTime() <= Date.now()
        ) {
        return NextResponse.json(
            {
            success: false,
            message: "The scheduled date must be in the future.",
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

        if (!["PAID", "AWAITING_SELLER_HANDOVER", "PROCESSING"].includes(order.status)) {
        return NextResponse.json(
            {
            success: false,
            message: "Handover can only be scheduled after payment.",
            },
            { status: 409 },
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
            message: "Handover information is unavailable for this item.",
            },
            { status: 409 },
        );
        }

        if (
        ["SCHEDULED", "IN_TRANSIT", "RECEIVED", "CANCELLED", "EXPIRED"].includes(
            item.handover.status,
        )
        ) {
        return NextResponse.json(
            {
            success: false,
            message: "This handover can no longer be scheduled.",
            },
            { status: 409 },
        );
        }

        if (item.handover.method === "HUB_DROP_OFF") {
        if (typeof input.hubId !== "string") {
            return NextResponse.json(
            {
                success: false,
                message: "Please select a Swap Hub.",
            },
            { status: 400 },
            );
        }

        const hub = swapHubs.find(
            (entry) => entry.id === input.hubId,
        );

        if (!hub) {
            return NextResponse.json(
            {
                success: false,
                message: "The selected Swap Hub is invalid.",
            },
            { status: 400 },
            );
        }

        item.handover.hubId = hub.id;
        item.handover.hubName = hub.name;
        item.handover.hubAddress = hub.address;
        } else if (item.handover.method === "PICKUP") {
        if (!item.handover.pickupAddress) {
            return NextResponse.json(
            {
                success: false,
                message: "The seller's pickup address is unavailable.",
            },
            { status: 409 },
            );
        }
        }

        item.handover.scheduledAt = scheduledAt;
        item.handover.status = "SCHEDULED";
        item.handover.requestedAt = new Date();

        await order.save();
        await createNotification({ recipientId: order.buyerId.toString(), senderId: auth.user.id, type: "ORDER_UPDATE", title: "Seller handover scheduled", message: `${item.name} has been scheduled for ${item.handover.method === "PICKUP" ? "pickup" : "Swap Hub drop-off"}.`, link: `/orders/${order._id.toString()}` });

        return NextResponse.json(
        {
            success: true,
            message: "Handover scheduled successfully.",
            data: {
            orderId: order._id,
            productId: input.productId,
            handover: item.handover,
            },
        },
        { status: 200 },
        );
    } catch (error) {
        console.error("Schedule handover error:", error);

        return NextResponse.json(
        {
            success: false,
            message: "Failed to schedule handover.",
        },
        { status: 500 },
        );
    }
    }
