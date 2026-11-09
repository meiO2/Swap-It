
    import { NextRequest, NextResponse } from "next/server";
    import { requireRole } from "@/lib/authorization";

    export const runtime = "nodejs";

    export async function POST(request: NextRequest) {
    try {
        // Only admins can use the simulator.
        const auth = await requireRole(["ADMIN"]);

        if (!auth.success) {
        return auth.response;
        }

        const deviceId = process.env.HUB_SIMULATOR_DEVICE_ID;
        const apiKey = process.env.HUB_SIMULATOR_API_KEY;

        if (!deviceId || !apiKey) {
        return NextResponse.json(
            { success: false, message: "Simulator credentials are not configured." },
            { status: 500 }
        );
        }

        const body: unknown = await request.json();

        if (
        !body ||
        typeof body !== "object" ||
        Array.isArray(body) ||
        typeof (body as Record<string, unknown>).token !== "string"
        ) {
        return NextResponse.json(
            { success: false, message: "A valid QR token is required." },
            { status: 400 }
        );
        }

        const response = await fetch(
        new URL("/api/iot/scan", request.url),
        {
            method: "POST",
            headers: {
            "Content-Type": "application/json",
            "x-device-id": deviceId,
            "x-device-key": apiKey,
            },
            body: JSON.stringify(body),
            cache: "no-store",
        }
        );

        const result = await response.json();

        return NextResponse.json(result, {
        status: response.status,
        });
    } catch (error) {
        console.error("Hub simulator scan error:", error);

        return NextResponse.json(
        { success: false, message: "Simulator scan request failed." },
        { status: 500 }
        );
    }
    }
