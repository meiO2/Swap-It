import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { requireRole } from "@/lib/authorization";
import { awardGreenPoints } from "@/lib/green-points";
import { calculateDonationReward } from "@/lib/green-point-rewards";
import { createNotification } from "@/lib/notifications";
import Donation from "@/models/Donation";

type RouteContext = { params: Promise<{ id: string }> };

class DonationFinalizationConflict extends Error {}

function parseCount(value: unknown): number | null {
  if (value === undefined) return 0;
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 30
    ? value
    : null;
}

export async function GET(_request: Request, { params }: RouteContext) {
  const auth = await requireRole(["CUSTOMER", "ADMIN", "INSPECTOR"]);
  if (!auth.success) return auth.response;

  try {
    await connectDB();
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: "Invalid donation ID." }, { status: 400 });
    }

    const isAdmin = ["ADMIN", "INSPECTOR"].includes(auth.user.role);
    const query = isAdmin
      ? Donation.findById(id).populate("userId", "name email phone")
      : Donation.findOne({ _id: id, userId: auth.user.id });
    const donation = await query.lean();
    if (!donation) {
      return NextResponse.json({ success: false, message: "Donation not found." }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: donation });
  } catch (error) {
    console.error("Get donation error:", error);
    return NextResponse.json({ success: false, message: "Failed to retrieve donation." }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const auth = await requireRole(["ADMIN", "INSPECTOR"]);
  if (!auth.success) return auth.response;

  try {
    await connectDB();
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: "Invalid donation ID." }, { status: 400 });
    }

    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ success: false, message: "Invalid classification details." }, { status: 400 });
    }

    const input = body as Record<string, unknown>;
    const resaleQualityItems = parseCount(input.resaleQualityItems);
    const upcyclingQualityItems = parseCount(input.upcyclingQualityItems);
    const socialDonationItems = parseCount(input.socialDonationItems);
    const rejectedItems = parseCount(input.rejectedItems);
    if (
      resaleQualityItems === null ||
      upcyclingQualityItems === null ||
      socialDonationItems === null ||
      rejectedItems === null
    ) {
      return NextResponse.json(
        { success: false, message: "Accepted and rejected quantities must be integers between 0 and 30." },
        { status: 400 },
      );
    }

    const acceptedItems = resaleQualityItems + upcyclingQualityItems + socialDonationItems;
    const totalItems = acceptedItems + rejectedItems;
    if (totalItems < 1 || totalItems > 30) {
      return NextResponse.json(
        { success: false, message: "Classified item quantities must total between 1 and 30." },
        { status: 400 },
      );
    }

    const gpAwarded = calculateDonationReward({
      resaleQualityItems,
      upcyclingQualityItems,
      socialDonationItems,
      rejectedItems,
    });

    const session = await mongoose.startSession();
    let updatedDonation: Awaited<ReturnType<typeof Donation.findById>>;
    let donorId = "";
    try {
      await session.withTransaction(async () => {
        const donation = await Donation.findOne({
          _id: id,
          status: { $in: ["UNDER_VERIFICATION", "PENDING"] },
        }).session(session);
        if (!donation) {
          throw new DonationFinalizationConflict("Donation is not awaiting verification.");
        }

        donorId = donation.userId.toString();
        const now = new Date();
        updatedDonation = await Donation.findOneAndUpdate(
          { _id: id, status: donation.status },
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
              verifiedAt: now,
              verifiedBy: auth.user.id,
            },
            $push: {
              classificationHistory: {
                classifiedBy: auth.user.id,
                classifiedAt: now,
                resaleQualityItems,
                upcyclingQualityItems,
                socialDonationItems,
                rejectedItems,
                gpAwarded,
              },
            },
          },
          { new: true, runValidators: true, session },
        );
        if (!updatedDonation) {
          throw new DonationFinalizationConflict("Donation was already processed.");
        }

        if (gpAwarded > 0) {
          await awardGreenPoints({
            userId: donorId,
            amount: gpAwarded,
            description: `Donation reward for ${acceptedItems} accepted item${acceptedItems === 1 ? "" : "s"}`,
            referenceKey: `donation:${id}`,
            session,
          });
        }
      });
    } finally {
      await session.endSession();
    }

    try {
      await createNotification({
        recipientId: donorId,
        type: "DONATION_DELIVERED",
        title: rejectedItems === totalItems ? "Donation reviewed" : "Donation verification complete",
        message: rejectedItems === totalItems
          ? "Your donation was reviewed, but all items were rejected and no GP was awarded."
          : `${gpAwarded.toLocaleString("id-ID")} GP was awarded after quality verification.${rejectedItems > 0 ? ` ${rejectedItems} item${rejectedItems === 1 ? " was" : "s were"} rejected.` : ""}`,
        link: "/donate",
      });
    } catch (notificationError) {
      console.error("Donation finalized but donor notification failed:", notificationError);
    }

    return NextResponse.json({
      success: true,
      message: "Donation completed successfully.",
      data: updatedDonation,
    });
  } catch (error) {
    if (error instanceof DonationFinalizationConflict) {
      return NextResponse.json({ success: false, message: error.message }, { status: 409 });
    }
    console.error("Update donation error:", error);
    return NextResponse.json({ success: false, message: "Failed to update donation." }, { status: 500 });
  }
}
