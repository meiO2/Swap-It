
    import { NextRequest, NextResponse } from "next/server";
    import mongoose from "mongoose";
    import { connectDB } from "@/lib/mongodb";
    import Donation from "@/models/Donation";
    import { requireRole } from "@/lib/authorization";
    import { awardGreenPoints, GREEN_POINT_REWARDS } from "@/lib/green-points";
    import { createNotification } from "@/lib/notifications";

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
        const {
            resaleQualityItems = 0,
            upcyclingQualityItems = 0,
            socialDonationItems = 0,
            rejectedItems = 0,
        } = body;

        // Validate quantities
        const qualityCounts = [
            resaleQualityItems,
            upcyclingQualityItems,
            socialDonationItems,
            rejectedItems,
        ];
        if (qualityCounts.some((value) => !Number.isSafeInteger(value) || value < 0)) {
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
        status: { $in: ["SESSION_CREATED", "QR_SCANNED", "UNDER_VERIFICATION", "PENDING"] },
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

        const acceptedItems = resaleQualityItems + upcyclingQualityItems + socialDonationItems;
        const totalItems = acceptedItems + rejectedItems;
        if (totalItems < 1) {
            return NextResponse.json({ success: false, message: "Quality counts must match the donation item count." }, { status: 400 });
        }
        const gpAwarded =
            resaleQualityItems * GREEN_POINT_REWARDS.donationResaleQualityPerItem +
            upcyclingQualityItems * GREEN_POINT_REWARDS.donationUpcyclingQualityPerItem +
            socialDonationItems * GREEN_POINT_REWARDS.donationSocialPerItem;

        // Finalize donation
        const updatedDonation = await Donation.findOneAndUpdate(
        { _id: id, status: { $in: ["SESSION_CREATED", "QR_SCANNED", "UNDER_VERIFICATION", "PENDING"] } },
        {
            $set: {
            acceptedItems,
            rejectedItems,
            resaleQualityItems,
            upcyclingQualityItems,
            socialDonationItems,
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
        if (gpAwarded > 0) {
            await awardGreenPoints({
                userId: donation.userId.toString(),
                amount: gpAwarded,
                description: `Donation reward for ${acceptedItems} accepted item${acceptedItems === 1 ? "" : "s"}`,
                referenceKey: `donation:${donation._id.toString()}`,
            });
        }
        await createNotification({ recipientId: donation.userId.toString(), type: "DONATION_DELIVERED", title: "Donation quality assessment complete", message: gpAwarded > 0 ? `${gpAwarded.toLocaleString("id-ID")} GP was awarded after quality assessment.` : "Your donation quality assessment is complete.", link: "/wallet" });

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
