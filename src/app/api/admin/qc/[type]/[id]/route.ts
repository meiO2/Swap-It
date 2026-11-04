import mongoose from "mongoose";
import { NextResponse, type NextRequest } from "next/server";
import { qcCriteriaByCategory } from "@/data/qcCriteria";
import { requireRole } from "@/lib/authorization";
import { connectDB } from "@/lib/mongodb";
import Listing from "@/models/Listing";
import Order from "@/models/Order";
import QCAssessment from "@/models/QCAssessment";

export async function PATCH(request: NextRequest, context: { params: Promise<{ type: string; id: string }> }) {
  const auth = await requireRole(["ADMIN", "INSPECTOR"]);
  if (!auth.success) return auth.response;
  try {
    const { type, id } = await context.params;
    if ((type !== "order" && type !== "listing") || !mongoose.isValidObjectId(id)) {
      return NextResponse.json({ success: false, message: "Invalid QC target." }, { status: 400 });
    }
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return NextResponse.json({ success: false, message: "Provide a valid QC assessment." }, { status: 400 });
    }
    const input = body as Record<string, unknown>;
    if (typeof input.category !== "string" || (input.decision !== "approve" && input.decision !== "reject") || !Array.isArray(input.answers)) {
      return NextResponse.json({ success: false, message: "Category, answers, and a decision are required." }, { status: 400 });
    }
    const criteria = qcCriteriaByCategory[input.category] ?? qcCriteriaByCategory.default;
    if (!criteria.length) {
      return NextResponse.json({ success: false, message: "QC criteria are not configured. Update src/data/qcCriteria.ts from the approved product specification before saving reviews." }, { status: 409 });
    }
    const answers = input.answers as Array<{ criterionId?: unknown; optionId?: unknown }>;
    if (answers.length !== criteria.length || criteria.some((criterion) => {
      const answer = answers.find((item) => item?.criterionId === criterion.id);
      return !answer || !criterion.options.some((option) => option.id === answer.optionId);
    })) {
      return NextResponse.json({ success: false, message: "Choose one valid option for every QC criterion." }, { status: 400 });
    }
    if (input.notes !== undefined && (typeof input.notes !== "string" || input.notes.length > 2000)) {
      return NextResponse.json({ success: false, message: "Notes must be 2,000 characters or fewer." }, { status: 400 });
    }
    await connectDB();
    const target = type === "order"
      ? await Order.findOne({ _id: id, status: "Processing", qcStatus: "pending" })
      : await Listing.findOne({ _id: id, status: { $in: ["Submitted", "Sorting"] } });
    if (!target) return NextResponse.json({ success: false, message: "QC item not found or already reviewed." }, { status: 404 });
    const assessment = await QCAssessment.create({
      entityType: type,
      entityId: target._id,
      reviewerId: auth.user.id,
      category: input.category,
      answers: answers.map((item) => ({ criterionId: String(item.criterionId), optionId: String(item.optionId) })),
      decision: input.decision,
      notes: input.notes,
    });
    if (type === "order") {
      const order = target as InstanceType<typeof Order>;
      const reviewedAt = new Date().toISOString();
      order.qcStatus = input.decision === "approve" ? "passed" : "rejected";
      order.status = input.decision === "approve" ? "Processing" : "QC review";
      order.timeline = (order.timeline ?? []).map((entry) => entry.key === "quality-check"
        ? { ...entry, at: reviewedAt, ...(input.decision === "reject" ? { label: "Quality check: item not eligible" } : {}) }
        : entry);
      if (input.decision === "reject") {
        order.qcDecisionDeadline = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
      }
      order.qcAssessmentId = assessment._id;
      await order.save();
    } else {
      const listing = target as InstanceType<typeof Listing>;
      listing.status = input.decision === "approve" ? "Passed" : "Not Eligible";
      await listing.save();
    }
    return NextResponse.json({ success: true, data: { id: String(assessment._id), decision: input.decision } }, { status: 201 });
  } catch (error) {
    console.error("Save QC assessment error:", error);
    return NextResponse.json({ success: false, message: "Could not save this QC assessment." }, { status: 500 });
  }
}
