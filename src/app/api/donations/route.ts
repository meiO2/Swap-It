
    import { NextRequest, NextResponse } from "next/server";
    import { connectDB } from "@/lib/mongodb";
    import Donation from "@/models/Donation";
    import { randomUUID } from "crypto";
    import { requireAuth } from "@/lib/authorization";

    export async function POST(request: NextRequest) {
        const auth = await requireAuth();
        if (!auth.success) return auth.response;
        try {
            await connectDB();

            const body = await request.json();
            const { hubId } = body;

            // Validate required fields
            if (!hubId) {
            return NextResponse.json(
                {
                success: false,
                message: "hubId is required.",
                },
                { status: 400 }
            );
            }

        if (typeof hubId !== "string" || !hubId.trim()) {
        return NextResponse.json(
            {
            success: false,
            message: "Invalid hubId.",
            },
            { status: 400 }
        );
        }

        // Create a new donation session
        const donation = await Donation.create({
        userId: auth.user.id,
        hubId: hubId.trim(),
        sessionId: randomUUID(),
        totalItems: 0,
        acceptedItems: 0,
        rejectedItems: 0,
        gpAwarded: 0,
        status: "SESSION_CREATED",
        });

        return NextResponse.json(
        {
            success: true,
            message: "Donation session created successfully.",
            data: donation,
        },
        { status: 201 }
        );
    } catch (error) {
        console.error("Create donation error:", error);

        return NextResponse.json(
        {
            success: false,
            message: "Failed to create donation session.",
        },
        { status: 500 }
        );
    }
    }

    
    export async function GET() {
        const auth = await requireAuth();
        if (!auth.success) return auth.response;
        try {
            await connectDB();

            // Retrieve donations belonging to this user
            const query = ["ADMIN", "INSPECTOR"].includes(auth.user.role)
                ? {}
                : { userId: auth.user.id };
            const donations = await Donation.find(query)
        .sort({ createdAt: -1 })
        .lean();

        return NextResponse.json(
        {
            success: true,
            count: donations.length,
            data: donations,
        },
        { status: 200 }
        );
    } catch (error) {
        console.error("Get donations error:", error);

        return NextResponse.json(
        {
            success: false,
            message: "Failed to retrieve donations.",
        },
        { status: 500 }
        );
    }
    }
