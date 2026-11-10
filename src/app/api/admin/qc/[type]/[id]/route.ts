
  import mongoose from "mongoose";
  import { NextResponse, type NextRequest } from "next/server";

  import { qcCriteriaByCategory } from "@/data/qcCriteria";
  import { requireRole } from "@/lib/authorization";
  import { isUploadedImageUrl } from "@/lib/image-urls";
  import { connectDB } from "@/lib/mongodb";

  import Order from "@/models/Order";
  import Product from "@/models/Product";
  import QCAssessment from "@/models/QCAssessment";
  import Notification from "@/models/Notification";

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

      const evidenceUrls = input.evidenceUrls === undefined
        ? []
        : Array.isArray(input.evidenceUrls) &&
            input.evidenceUrls.every(
              (url): url is string =>
                typeof url === "string" &&
                isUploadedImageUrl(url) &&
                url.length <= 2000,
            )
          ? input.evidenceUrls
          : null;

      if (
        evidenceUrls === null ||
        evidenceUrls.length > 8
      ) {
        return NextResponse.json(
          {
            success: false,
            message:
              "QC evidence must contain 1-8 uploaded photos.",
          },
          { status: 400 },
        );
      }

      if (
        typeof input.productId !== "string" ||
        !mongoose.isValidObjectId(input.productId) ||
        typeof input.category !== "string" ||
        !Array.isArray(input.answers)
      ) {
        return NextResponse.json(
          {
            success: false,
            message: "Product, category, and answers are required.",
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

      const hasIssues = answers.some((answer) => answer.optionId !== "good");

      if (hasIssues && (!evidenceUrls || evidenceUrls.length === 0)) {
        return NextResponse.json(
          {
            success: false,
            message: "Add at least one evidence photo for every flagged QC result.",
          },
          { status: 400 },
        );
      }

      await connectDB();

      const productId = new mongoose.Types.ObjectId(input.productId);

      const order = await Order.findById(id);

      if (!order) {
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
        (item.handover?.status !== "RECEIVED" &&
          item.qcStatus !== "PENDING" &&
          order.status !== "RECEIVED" &&
          order.status !== "QC_IN_PROGRESS")
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
            // The assessment records that the inspection was completed.
            // Buyer-facing outcome is stored separately on the order item.
            decision: "approve",
            notes: input.notes,
            evidenceUrls,
          });

          await assessment.save({ session });

          const currentOrder = await Order.findById(order._id).session(session);

          if (!currentOrder) {
            throw new Error("Order is no longer available for QC.");
          }

          const currentItem = currentOrder.items.find(
            (entry) =>
              entry.productId.toString() === productId.toString(),
          );

          if (
            !currentItem ||
            (currentItem.handover?.status !== "RECEIVED" &&
              currentItem.qcStatus !== "PENDING" &&
              currentOrder.status !== "RECEIVED" &&
              currentOrder.status !== "QC_IN_PROGRESS") ||
            currentItem.qcAssessmentId
          ) {
            throw new Error("Product is no longer available for QC.");
          }

          currentItem.qcAssessmentId = assessment._id;
          if (currentItem.handover) {
            currentItem.handover.status = "RECEIVED";
          }
          currentItem.listingPriceSnapshot ??= currentItem.price;

          if (!hasIssues) {
            currentItem.qcStatus = "PASSED";
            currentItem.qcDecisionDeadline = undefined;
            await Product.updateOne({ _id: productId }, { $set: { status: "QC_PASSED" } }, { session });
          } else {
            currentItem.qcStatus = "FAILED_AWAITING_BUYER";
            currentItem.qcDecisionDeadline = new Date(
              Date.now() + 3 * 24 * 60 * 60 * 1000,
            );
            currentOrder.status = "AWAITING_BUYER_CONFIRMATION";
            await Product.updateOne({ _id: productId }, { $set: { status: "AWAITING_BUYER_CONFIRMATION" } }, { session });
          }

          await currentOrder.save({
            session,
            validateModifiedOnly: true,
          });

          await Notification.create(
            [
              {
                recipientId: currentOrder.buyerId,
                senderId: new mongoose.Types.ObjectId(auth.user.id),
                type: "QC_UPDATE",
                title: hasIssues
                  ? "QC selesai: pilihan diperlukan"
                  : "QC selesai: barang lolos pemeriksaan",
                message: hasIssues
                  ? `Pemeriksaan menemukan ${answers.filter((answer) => answer.optionId !== "good").length} bagian yang perlu kamu tinjau. Buka laporan QC untuk memilih terima atau tolak barang.`
                  : "Pemeriksaan kualitas selesai dan barang siap diproses ke tahap berikutnya.",
                link: `/orders/${currentOrder._id.toString()}`,
                isRead: false,
              },
            ],
            { session },
          );

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
            decision: "approve",
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
