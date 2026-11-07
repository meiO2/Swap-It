
    import { NextRequest, NextResponse } from "next/server";
    import { randomBytes, createHash } from "crypto";
    import mongoose from "mongoose";

    import { requireAuth } from "@/lib/authorization";
    import { connectDB } from "@/lib/mongodb";
    import { getSwapHubs } from "@/lib/hubs";

    import HubAccessToken from "@/models/HubAccessToken";
    import Donation from "@/models/Donation";
    import Order from "@/models/Order";

    const TOKEN_TTL_SECONDS = 300;

    function hashToken(token: string) {
    return createHash("sha256").update(token).digest("hex");
    }

    export async function POST(request: NextRequest) {
    try {
        const auth = await requireAuth();
        if (!auth.success) return auth.response;

        await connectDB();

        const body: unknown = await request.json();

        if (!body || typeof body !== "object" || Array.isArray(body)) {
        return NextResponse.json(
            { success: false, message: "Invalid QR session information." },
            { status: 400 },
        );
        }

        const input = body as Record<string, unknown>;

        const { activity, hubId } = input;

        if (
        activity !== "DONATION" &&
        activity !== "SELLER_HANDOVER"
        ) {
        return NextResponse.json(
            { success: false, message: "Invalid QR activity." },
            { status: 400 },
        );
        }

        if (typeof hubId !== "string" || !hubId.trim()) {
        return NextResponse.json(
            { success: false, message: "A valid Swap Hub is required." },
            { status: 400 },
        );
        }

        // Verify that the selected hub exists and is active.
        const hubs = await getSwapHubs();
        const hub = hubs.find((entry) => entry.id === hubId);

        if (!hub) {
        return NextResponse.json(
            { success: false, message: "The selected Swap Hub is unavailable." },
            { status: 404 },
        );
        }

        let tokenReference:
        | { donationSessionId: string }
        | { orderId: mongoose.Types.ObjectId; productId: mongoose.Types.ObjectId };

        let revokeQuery: Record<string, unknown>;

        if (activity === "DONATION") {
        const donationId = input.donationId;

        if (
            typeof donationId !== "string" ||
            !mongoose.Types.ObjectId.isValid(donationId)
        ) {
            return NextResponse.json(
            { success: false, message: "A valid donation ID is required." },
            { status: 400 },
            );
        }

        const donation = await Donation.findOne({
            _id: donationId,
            userId: auth.user.id,
            hubId,
            status: "PENDING",
        });

        if (!donation) {
            return NextResponse.json(
            {
                success: false,
                message: "Active donation session not found.",
            },
            { status: 404 },
            );
        }

        tokenReference = {
            donationSessionId: donation.sessionId,
        };

        revokeQuery = {
            activity: "DONATION",
            userId: auth.user.id,
            donationSessionId: donation.sessionId,
            status: "ACTIVE",
        };
        } else {
        const orderId = input.orderId;
        const productId = input.productId;

        if (
            typeof orderId !== "string" ||
            !mongoose.Types.ObjectId.isValid(orderId) ||
            typeof productId !== "string" ||
            !mongoose.Types.ObjectId.isValid(productId)
        ) {
            return NextResponse.json(
            {
                success: false,
                message: "Valid order and product IDs are required.",
            },
            { status: 400 },
            );
        }

        const order = await Order.findOne({
            _id: orderId,
            status: { $in: ["PAID", "PROCESSING"] },
            "items.productId": productId,
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
            entry.productId.toString() === productId &&
            entry.sellerId.toString() === auth.user.id,
        );

        if (
            !item ||
            !item.handover ||
            item.handover.method !== "HUB_DROP_OFF" ||
            item.handover.status !== "SCHEDULED" ||
            item.handover.hubId !== hubId
        ) {
            return NextResponse.json(
            {
                success: false,
                message: "This item does not have an eligible handover at this hub.",
            },
            { status: 409 },
            );
        }

        tokenReference = {
            orderId: order._id,
            productId: item.productId,
        };

        revokeQuery = {
            activity: "SELLER_HANDOVER",
            userId: auth.user.id,
            orderId: order._id,
            productId: item.productId,
            status: "ACTIVE",
        };
        }

        // Revoke previous active QR codes for the same transaction.
        await HubAccessToken.updateMany(revokeQuery, {
        $set: { status: "REVOKED" },
        });

        // Generate a cryptographically secure, one-time token.
        const token = randomBytes(32).toString("base64url");
        const expiresAt = new Date(
        Date.now() + TOKEN_TTL_SECONDS * 1000,
        );

        await HubAccessToken.create({
        tokenHash: hashToken(token),
        activity,
        userId: auth.user.id,
        hubId,
        ...tokenReference,
        status: "ACTIVE",
        expiresAt,
        });

        return NextResponse.json(
        {
            success: true,
            message: "QR access token generated successfully.",
            data: {
            token,
            activity,
            hubId,
            expiresAt,
            ttlSeconds: TOKEN_TTL_SECONDS,
            },
        },
        { status: 201 },
        );
    } catch (error) {
        console.error("Generate Hub access token error:", error);

        return NextResponse.json(
        {
            success: false,
            message: "Failed to generate QR access token.",
        },
        { status: 500 },
        );
    }
    }
