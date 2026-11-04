    import { NextResponse } from "next/server";
    import mongoose from "mongoose";
    import { connectDB } from "@/lib/mongodb";
    import Donation from "@/models/Donation";
    import { requireAuth } from "@/lib/authorization";

    type RouteContext = {
    params: Promise<{ id: string }>;
    };

    export async function PATCH(
    request: Request,
    { params }: RouteContext
    ) {
        const auth = await requireAuth();
        if (!auth.success) return auth.response;
        try {
        await connectDB();

        const { id } = await params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
        return NextResponse.json(
            { success: false, message: "Invalid donation ID." },
            { status: 400 }
        );
        }

        const donation = await Donation.findOneAndUpdate(
        {
            _id: id,
            userId: auth.user.id,
            status: "PENDING",
        },
        {
            $set: {
            status: "CANCELLED",
            },
        },
        {
            new: true,
            runValidators: true,
        }
        );

        if (!donation) {
        const existingDonation = await Donation.findOne({ _id: id, userId: auth.user.id });

        if (!existingDonation) {
            return NextResponse.json(
            { success: false, message: "Donation not found." },
            { status: 404 }
            );
        }

        return NextResponse.json(
            {
            success: false,
            message: `Cannot cancel a donation with status ${existingDonation.status}.`,
            },
            { status: 409 }
        );
        }

        return NextResponse.json(
        {
            success: true,
            message: "Donation cancelled successfully.",
            data: donation,
        },
        { status: 200 }
        );
    } catch (error) {
        console.error("Cancel donation error:", error);

        return NextResponse.json(
        {
            success: false,
            message: "Failed to cancel donation.",
        },
        { status: 500 }
        );
    }
    }