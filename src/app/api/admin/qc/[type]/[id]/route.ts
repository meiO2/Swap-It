
import mongoose from "mongoose";
import { NextResponse, type NextRequest } from "next/server";

import { qcCriteriaByCategory } from "@/data/qcCriteria";
import { requireRole } from "@/lib/authorization";
import { connectDB } from "@/lib/mongodb";

import Listing from "@/models/Listing";
import Order from "@/models/Order";
import QCAssessment from "@/models/QCAssessment";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ type: string; id: string }> },
) {
  const auth = await requireRole(["ADMIN", "INSPECTOR"]);

  if (!auth.success) return auth.response;

  try {
    const { type, id } = await context.params;

    if (
      (type !== "order" && type !== "listing") ||
      !mongoose.isValidObjectId(id)
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid QC target." },
        { status: 400 },
      );
    }

    const body: unknown = await request.json();

    if (
      typeof body !== "object" ||
      body === null ||
      Array.isArray(body)
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid QC assessment." },
        { status: 400 },
      );
    }

    const input = body as Record<string, unknown>;

    if (
      typeof input.category !== "string" ||
      (input.decision !== "approve" && input.decision !== "reject") ||
      !Array.isArray(input.answers)
    ) {
      return NextResponse.json(
        { success: false, message: "Category, answers, and decision are required." },
        { status: 400 },
      );
    }

    if (
      input.notes !== undefined &&
      (typeof input.notes !== "string" || input.notes.length > 2000)
    ) {
      return NextResponse.json(
        { success: false, message: "Notes must not exceed 2,000 characters." },
        { status: 400 },
      );
    }

    const criteria =
      qcCriteriaByCategory[input.category] ??
      qcCriteriaByCategory.default;

    if (!criteria.length) {
      return NextResponse.json(
        { success: false, message: "QC criteria are not configured." },
        { status: 409 },
      );
    }

    const answers = input.answers as Array<{
      criterionId?: unknown;
      optionId?: unknown;
    }>;

    const validAnswers =
      answers.length === criteria.length &&
      criteria.every((criterion) => {
        const answer = answers.find(
          (item) => item?.criterionId === criterion.id,
        );

        return (
          answer &&
          criterion.options.some(
            (option) => option.id === answer.optionId,
          )
        );
      });

    if (!validAnswers) {
      return NextResponse.json(
        { success: false, message: "Answer every QC criterion correctly." },
        { status: 400 },
      );
    }

    await connectDB();

    let productId: mongoose.Types.ObjectId | undefined;

    if (type === "order") {
      if (
        typeof input.productId !== "string" ||
        !mongoose.isValidObjectId(input.productId)
      ) {
        return NextResponse.json(
          { success: false, message: "A valid productId is required." },
          { status: 400 },
        );
      }

      productId = new mongoose.Types.ObjectId(input.productId);

      const order = await Order.findById(id);

      if (!order || order.status !== "PROCESSING") {
        return NextResponse.json(
          { success: false, message: "Order is not available for QC." },
          { status: 404 },
        );
      }

      const item = order.items.find(
        (entry) =>
          entry.productId.toString() === productId!.toString(),
      );

      if (
        !item ||
        item.handover?.method !== "HUB_DROP_OFF" ||
        item.handover.status !== "RECEIVED"
      ) {
        return NextResponse.json(
          { success: false, message: "Product has not been received at the Hub." },
          { status: 409 },
        );
      }
    } else {
      const listing = await Listing.findOne({
        _id: id,
        status: { $in: ["Submitted", "Sorting"] },
      });

      if (!listing) {
        return NextResponse.json(
          { success: false, message: "Listing is not available for QC." },
          { status: 404 },
        );
      }
    }

    const existingAssessment = await QCAssessment.findOne({
      entityType: type,
      entityId: new mongoose.Types.ObjectId(id),
      ...(productId ? { productId } : {}),
    });

    if (existingAssessment) {
      return NextResponse.json(
        { success: false, message: "This item has already been assessed." },
        { status: 409 },
      );
    }

    const assessment = await QCAssessment.create({
      entityType: type,
      entityId: new mongoose.Types.ObjectId(id),
      ...(productId ? { productId } : {}),
      reviewerId: new mongoose.Types.ObjectId(auth.user.id),
      category: input.category,
      answers: answers.map((item) => ({
        criterionId: String(item.criterionId),
        optionId: String(item.optionId),
      })),
      decision: input.decision,
      notes: input.notes,
    });


    if (type === "order") {
      const order = await Order.findById(id);

      if (!order || !productId) {
        return NextResponse.json(
          {
            success: false,
            message: "Order or product not found.",
          },
          { status: 404 },
        );
      }

      const item = order.items.find(
        (entry) =>
          entry.productId.toString() === productId.toString(),
      );

      if (!item) {
        return NextResponse.json(
          {
            success: false,
            message: "Product not found in this order.",
          },
          { status: 404 },
        );
      }

      // Update only the inspected product.
      item.qcAssessmentId = assessment._id;

      if (input.decision === "approve") {
        item.qcStatus = "PASSED";
        item.qcDecisionDeadline = undefined;
      } else {
        item.qcStatus = "FAILED_AWAITING_BUYER";

        // Buyer receives 3 days to make a decision.
        item.qcDecisionDeadline = new Date(
          Date.now() + 3 * 24 * 60 * 60 * 1000,
        );
      }

      await order.save();

    } else {
      const listing = await Listing.findById(id);

      if (!listing) {
        return NextResponse.json(
          {
            success: false,
            message: "Listing not found.",
          },
          { status: 404 },
        );
      }

      listing.status =
        input.decision === "approve"
          ? "Passed"
          : "Not Eligible";

      await listing.save();
    }


    return NextResponse.json(
      {
        success: true,
        data: {
          id: String(assessment._id),
          entityType: type,
          entityId: id,
          productId: productId?.toString(),
          decision: input.decision,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Save QC assessment error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Could not save this QC assessment.",
      },
      { status: 500 },
    );
  }
}
