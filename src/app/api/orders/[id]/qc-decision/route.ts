
    import mongoose from "mongoose";
    import { NextRequest, NextResponse } from "next/server";

    import { requireAuth } from "@/lib/authorization";
    import { connectDB } from "@/lib/mongodb";
    import Order from "@/models/Order";
    import Product from "@/models/Product";
    import Notification from "@/models/Notification";
    import { createQcCompensation } from "@/lib/refunds";

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
        order.status = "PROCESSING";
        await Product.updateOne({ _id: item.productId }, { $set: { status: "READY_TO_SHIP" } });
        } else {
        item.qcStatus = "BUYER_REJECTED";
        item.returnStatus = "AWAITING_SELLER";
        item.returnDeadline = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
        order.status = "CANCELLED";
        await Product.updateOne({ _id: item.productId }, { $set: { status: "RETURN_PENDING" } });
        }

        await order.save();

        if (input.decision === "REJECT") {
          await createQcCompensation({ orderId: id, userId: auth.user.id, productId: input.productId });
          await Notification.create({
            recipientId: item.sellerId,
            type: "ORDER_UPDATE",
            title: "Item awaiting retrieval",
            message: "The buyer rejected the QC report. Retrieve the item or request return delivery within 14 calendar days.",
            link: `/orders/${order._id.toString()}`,
            isRead: false,
          });
          await Notification.create({
            recipientId: auth.user.id,
            type: "QC_UPDATE",
            title: "QC rejection refund processed",
            message: `Your rejection was recorded. ${item.price.toLocaleString("id-ID")} GP will be credited as compensation.`,
            link: `/orders/${order._id.toString()}`,
            isRead: false,
          });
        }

        return NextResponse.json({
        success: true,
        message:
            input.decision === "ACCEPT"
            ? "You accepted the product. It can proceed to shipping."
            : "Your rejection has been recorded. Product value and service fee were returned as Green Points.",
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
