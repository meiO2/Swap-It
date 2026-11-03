
    import { NextRequest, NextResponse } from "next/server";
    import mongoose from "mongoose";
    import { connectDB } from "@/lib/mongodb";
    import Donation from "@/models/Donation";
    import { randomUUID } from "crypto";

    export async function POST(request: NextRequest) {
    try {
        await connectDB();

        const body = await request.json();
        const { userId, hubId } = body;

        // Validate required fields
        if (!userId || !hubId) {
        return NextResponse.json(
            {
            success: false,
            message: "userId and hubId are required.",
            },
            { status: 400 }
        );
        }

        // Validate MongoDB ObjectId
        if (!mongoose.Types.ObjectId.isValid(userId)) {
        return NextResponse.json(
            {
            success: false,
            message: "Invalid userId.",
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
        userId,
        hubId: hubId.trim(),
        sessionId: randomUUID(),
        totalItems: 0,
        acceptedItems: 0,
        rejectedItems: 0,
        gpAwarded: 0,
        status: "PENDING",
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

    
    export async function GET(request: NextRequest) {
    try {
        await connectDB();

        const { searchParams } = new URL(request.url);
        const userId = searchParams.get("userId");

        // Validate userId
        if (!userId) {
        return NextResponse.json(
            {
            success: false,
            message: "userId is required.",
            },
            { status: 400 }
        );
        }

        if (!mongoose.Types.ObjectId.isValid(userId)) {
        return NextResponse.json(
            {
            success: false,
            message: "Invalid userId.",
            },
            { status: 400 }
        );
        }

        // Retrieve donations belonging to this user
        const donations = await Donation.find({ userId })
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
