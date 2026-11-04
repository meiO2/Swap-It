
    import { NextRequest, NextResponse } from "next/server";
    import mongoose from "mongoose";
    import { connectDB } from "@/lib/mongodb";
    import Donation from "@/models/Donation";
    import { requireRole } from "@/lib/authorization";

    type RouteContext = {
    params: Promise<{ id: string }>;
    };

    export async function PATCH(
    request: NextRequest,
    { params }: RouteContext
    ) {
        const auth = await requireRole(["ADMIN", "INSPECTOR"]);
        if (!auth.success) return auth.response;
        try {
        await connectDB();

        const { id } = await params;

        // Validate donation ID
        if (!mongoose.Types.ObjectId.isValid(id)) {
        return NextResponse.json(
            { success: false, message: "Invalid donation ID." },
            { status: 400 }
        );
        }

        const body = await request.json();
        const { acceptedItems, rejectedItems } = body;

        // Validate quantities
        if (
        !Number.isSafeInteger(acceptedItems) ||
        !Number.isSafeInteger(rejectedItems) ||
        acceptedItems < 0 ||
        rejectedItems < 0
        ) {
        return NextResponse.json(
            {
            success: false,
            message: "Accepted and rejected quantities must be non-negative integers.",
            },
            { status: 400 }
        );
        }

        // Find an active donation session
        const donation = await Donation.findOne({
        _id: id,
        status: "PENDING",
        });

        if (!donation) {
        return NextResponse.json(
            {
            success: false,
            message: "Pending donation not found or already completed.",
            },
            { status: 404 }
        );
        }

        const totalItems = acceptedItems + rejectedItems;
        const gpAwarded = acceptedItems * 100;

        // Finalize donation
        const updatedDonation = await Donation.findOneAndUpdate(
        { _id: id, status: "PENDING" },
        {
            $set: {
            acceptedItems,
            rejectedItems,
            totalItems,
            gpAwarded,
            status: "COMPLETED",
            confirmedAt: new Date(),
            },
        },
        { new: true, runValidators: true }
        );

        if (!updatedDonation) {
        return NextResponse.json(
            {
            success: false,
            message: "Donation was already processed.",
            },
            { status: 409 }
        );
        }

        return NextResponse.json(
        {
            success: true,
            message: "Donation completed successfully.",
            data: updatedDonation,
        },
        { status: 200 }
        );

    } catch (error) {
        console.error("Update donation error:", error);

        return NextResponse.json(
        {
            success: false,
            message: "Failed to update donation.",
        },
        { status: 500 }
        );
    }
    }
