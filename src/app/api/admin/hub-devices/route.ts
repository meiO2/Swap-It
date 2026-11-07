
    import { NextRequest, NextResponse } from "next/server";
    import { randomBytes, createHash } from "crypto";

    import { requireRole } from "@/lib/authorization";
    import { connectDB } from "@/lib/mongodb";
    import { getSwapHubs } from "@/lib/hubs";

    import HubDevice from "@/models/HubDevice";

    function hashApiKey(apiKey: string) {
    return createHash("sha256").update(apiKey).digest("hex");
    }

    // Register a new physical or simulated Hub device.
    export async function POST(request: NextRequest) {
    try {
        const auth = await requireRole(["ADMIN"]);
        if (!auth.success) return auth.response;

        const body: unknown = await request.json();

        if (!body || typeof body !== "object" || Array.isArray(body)) {
        return NextResponse.json(
            { success: false, message: "Invalid device information." },
            { status: 400 },
        );
        }

        const input = body as Record<string, unknown>;

        if (
        typeof input.deviceId !== "string" ||
        !/^[A-Z0-9-]{3,50}$/.test(input.deviceId)
        ) {
        return NextResponse.json(
            {
            success: false,
            message:
                "Device ID must contain 3–50 uppercase letters, numbers, or hyphens.",
            },
            { status: 400 },
        );
        }

        if (
        typeof input.hubId !== "string" ||
        !input.hubId.trim()
        ) {
        return NextResponse.json(
            { success: false, message: "A valid Hub ID is required." },
            { status: 400 },
        );
        }

        await connectDB();

        const hubs = await getSwapHubs();
        const hub = hubs.find((entry) => entry.id === input.hubId);

        if (!hub) {
        return NextResponse.json(
            { success: false, message: "The selected Swap Hub is unavailable." },
            { status: 404 },
        );
        }

        const existingDevice = await HubDevice.findOne({
        deviceId: input.deviceId,
        });

        if (existingDevice) {
        return NextResponse.json(
            {
            success: false,
            message: "This device ID is already registered.",
            },
            { status: 409 },
        );
        }

        // Generate a secret that is shown only once.
        const apiKey = randomBytes(32).toString("base64url");

        const device = await HubDevice.create({
        deviceId: input.deviceId,
        hubId: input.hubId,
        apiKeyHash: hashApiKey(apiKey),
        status: "ACTIVE",
        });

        return NextResponse.json(
        {
            success: true,
            message: "Hub device registered successfully.",
            data: {
            device: {
                id: device._id.toString(),
                deviceId: device.deviceId,
                hubId: device.hubId,
                hubName: hub.name,
                status: device.status,
                createdAt: device.createdAt,
            },
            credentials: {
                apiKey,
                warning:
                "Store this API key securely. It will not be shown again.",
            },
            },
        },
        { status: 201 },
        );
    } catch (error) {
        console.error("Register Hub device error:", error);

        return NextResponse.json(
        {
            success: false,
            message: "Failed to register Hub device.",
        },
        { status: 500 },
        );
    }
    }
