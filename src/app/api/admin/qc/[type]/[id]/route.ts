
  import mongoose from "mongoose";
  import { NextResponse, type NextRequest } from "next/server";

  import { qcCriteriaByCategory } from "@/data/qcCriteria";
  import { requireRole } from "@/lib/authorization";
  import { connectDB } from "@/lib/mongodb";

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

      if (type !== "order" || !mongoose.isValidObjectId(id)) {
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
        typeof input.productId !== "string" ||
        !mongoose.isValidObjectId(input.productId) ||
        typeof input.category !== "string" ||
        (input.decision !== "approve" && input.decision !== "reject") ||
        !Array.isArray(input.answers)
      ) {
        return NextResponse.json(
          {
            success: false,
            message: "Product, category, answers, and decision are required.",
          },
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

      const productId = new mongoose.Types.ObjectId(input.productId);

      const order = await Order.findById(id);

      if (!order || order.status !== "PROCESSING") {
        return NextResponse.json(
          { success: false, message: "Order is not available for QC." },
          { status: 404 },
        );
      }

      const item = order.items.find(
        (entry) => entry.productId.toString() === productId.toString(),
      );

      if (
        !item ||
        item.handover?.method !== "HUB_DROP_OFF" ||
        item.handover.status !== "RECEIVED"
      ) {
        return NextResponse.json(
          {
            success: false,
            message: "Product has not been received at the Hub.",
          },
          { status: 409 },
        );
      }

      const existingAssessment = await QCAssessment.findOne({
        entityType: "order",
        entityId: order._id,
        productId,
      });

      if (existingAssessment || item.qcAssessmentId) {
        return NextResponse.json(
          { success: false, message: "This item has already been assessed." },
          { status: 409 },
        );
      }

      const session = await mongoose.startSession();

      let assessmentId: mongoose.Types.ObjectId | undefined;

      try {
        await session.withTransaction(async () => {
          const assessment = new QCAssessment({
            entityType: "order",
            entityId: order._id,
            productId,
            reviewerId: new mongoose.Types.ObjectId(auth.user.id),
            category: input.category,
            answers: answers.map((answer) => ({
              criterionId: String(answer.criterionId),
              optionId: String(answer.optionId),
            })),
            decision: input.decision,
            notes: input.notes,
          });

          await assessment.save({ session });

          const currentOrder = await Order.findById(order._id).session(session);

          if (!currentOrder || currentOrder.status !== "PROCESSING") {
            throw new Error("Order is no longer available for QC.");
          }

          const currentItem = currentOrder.items.find(
            (entry) =>
              entry.productId.toString() === productId.toString(),
          );

          if (
            !currentItem ||
            currentItem.handover?.method !== "HUB_DROP_OFF" ||
            currentItem.handover.status !== "RECEIVED" ||
            currentItem.qcAssessmentId
          ) {
            throw new Error("Product is no longer available for QC.");
          }

          currentItem.qcAssessmentId = assessment._id;

          if (input.decision === "approve") {
            currentItem.qcStatus = "PASSED";
            currentItem.qcDecisionDeadline = undefined;
          } else {
            currentItem.qcStatus = "FAILED_AWAITING_BUYER";
            currentItem.qcDecisionDeadline = new Date(
              Date.now() + 3 * 24 * 60 * 60 * 1000,
            );
          }

          await currentOrder.save({ session });

          assessmentId = assessment._id;
        });
      } finally {
        await session.endSession();
      }

      if (!assessmentId) {
        throw new Error("QC assessment could not be completed.");
      }

      return NextResponse.json(
        {
          success: true,
          data: {
            id: String(assessmentId),
            entityType: "order",
            entityId: id,
            productId: productId.toString(),
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
