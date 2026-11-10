
    import { NextRequest, NextResponse } from "next/server";
    import { createHash } from "crypto";
    import { connectDB } from "@/lib/mongodb";
    import { authenticateHubDevice } from "@/lib/hub-device-auth";
    import HubAccessToken from "@/models/HubAccessToken";
    import Donation from "@/models/Donation";
    import Order from "@/models/Order";

    import type {
    HubScanRequest,
    HubScanSuccessResponse,
    HubErrorResponse,
    } from "@/types/hub-device";

    import HubDeviceSession from "@/models/HubDeviceSession";

    function hashToken(token: string) {
    return createHash("sha256").update(token).digest("hex");
    }

    function errorResponse(message: string, status: number) {
    const response: HubErrorResponse = {
        success: false,
        message,
    };

    return NextResponse.json(response, { status });
    }

    export async function POST(request: NextRequest) {
    try {
        await connectDB();
        
        const device = await authenticateHubDevice(request);

        if (!device) {
        return errorResponse("Invalid device credentials.", 401);
        }

        const body: unknown = await request.json();

        if (
        !body ||
        typeof body !== "object" ||
        Array.isArray(body) ||
        typeof (body as Record<string, unknown>).token !== "string"
        ) {
        return errorResponse("A valid QR token is required.", 400);
        }

        const { token } = body as HubScanRequest;
        const normalizedToken = token.trim();

        if (!normalizedToken || normalizedToken.length > 200) {
        return errorResponse("Invalid QR token.", 400);
        }

        const tokenHash = hashToken(normalizedToken);
        const now = new Date();

        const accessToken = await HubAccessToken.findOne({
        tokenHash,
        hubId: device.hubId,
        status: "ACTIVE",
        expiresAt: { $gt: now },
        }).lean();

        if (!accessToken) {
        return errorResponse(
            "QR token is invalid, expired, or already used.",
            409
        );
        }

        // Verify donation eligibility.
        if (accessToken.activity === "DONATION") {
        const donation = await Donation.findOne({
            sessionId: accessToken.donationSessionId,
            userId: accessToken.userId,
            hubId: device.hubId,
            status: { $in: ["SESSION_CREATED", "QR_SCANNED"] },
        }).lean();

        if (!donation) {
            return errorResponse("Donation session is no longer valid.", 409);
        }
        }

        // Verify seller handover eligibility.
        else if (accessToken.activity === "SELLER_HANDOVER") {
        const order = await Order.findOne({
            _id: accessToken.orderId,
            status: { $in: ["PAID", "AWAITING_SELLER_HANDOVER", "PROCESSING"] },
            "items.sellerId": accessToken.userId,
            "items.productId": accessToken.productId,
        }).lean();

        const handoverItem = order?.items.find(
            (item) =>
            item.productId?.toString() ===
            accessToken.productId?.toString()
        );

        if (
            !handoverItem ||
            handoverItem.handover?.method !== "HUB_DROP_OFF" ||
            handoverItem.handover?.status !== "SCHEDULED" ||
            handoverItem.handover?.hubId !== device.hubId
        ) {
            return errorResponse("Seller handover is no longer valid.", 409);
        }
        } else {
        return errorResponse("Unsupported QR activity.", 400);
        }

        // Atomically consume the QR token.
        const consumedToken = await HubAccessToken.findOneAndUpdate(
        {
            _id: accessToken._id,
            tokenHash,
            hubId: device.hubId,
            status: "ACTIVE",
            expiresAt: { $gt: new Date() },
        },
        {
            $set: {
            status: "CONSUMED",
            consumedAt: new Date(),
            consumedByDeviceId: device.deviceId,
            },
        },
        { new: true }
        ).lean();

        if (!consumedToken) {
        return errorResponse("QR token has already been used.", 409);
        }

        if (consumedToken.activity === "DONATION" && consumedToken.donationSessionId) {
            await Donation.updateOne(
                { sessionId: consumedToken.donationSessionId, status: "SESSION_CREATED" },
                { $set: { status: "QR_SCANNED" } },
            );
        }

        const deviceSession = await HubDeviceSession.create({
            deviceId: device.deviceId,
            hubId: device.hubId,
            accessTokenId: consumedToken._id,
            activity: consumedToken.activity,
            donationSessionId: consumedToken.donationSessionId,
            orderId: consumedToken.orderId?.toString(),
            productId: consumedToken.productId?.toString(),
            state: "AUTHORIZED",
            itemDetected: false,
            events: [],
        });

        const response: HubScanSuccessResponse = {
        success: true,
        action: "UNLOCK",
        message: "QR verified. Door unlock authorized.",
        data: {
            sessionId: deviceSession._id.toString(),
            activity: consumedToken.activity,
            hubId: consumedToken.hubId,
            deviceId: device.deviceId,
            donationSessionId: consumedToken.donationSessionId ?? null,
            orderId: consumedToken.orderId?.toString() ?? null,
            productId: consumedToken.productId?.toString() ?? null,
        },
        };

        return NextResponse.json(response);
    } catch (error) {
        console.error("Hub QR scan error:", error);

        return errorResponse("Failed to process QR scan.", 500);
    }
    }
