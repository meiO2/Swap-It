
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
  import { createQcCompensation, orderHasActiveRefund } from "@/lib/refunds";
  import { touchSettlementOrderFence } from "@/lib/settlement-order-fence";
  import { reverseOrderGreenPointRewards } from "@/lib/green-points";

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
          await touchSettlementOrderFence(order._id, session);
          const currentOrder = await Order.findById(order._id).session(session);
          if (!currentOrder || ["CANCELLED", "REFUNDED", "EXPIRED"].includes(currentOrder.status) ||
            await orderHasActiveRefund(order._id, session)) {
            throw new Error("QC is unavailable while refund resolution is in progress.");
          }
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
            currentItem.qcStatus = "FAILED";
            currentItem.qcDecisionDeadline = undefined;
            const returnDeadline = new Date(
              Date.now() + 14 * 24 * 60 * 60 * 1000,
            );
            for (const orderItem of currentOrder.items) {
              orderItem.returnStatus = "AWAITING_SELLER";
              orderItem.returnDeadline = returnDeadline;
            }
            currentOrder.status = "CANCELLED";
            await Product.updateMany(
              { _id: { $in: currentOrder.items.map((entry) => entry.productId) } },
              { $set: { status: "RETURN_PENDING" } },
              { session },
            );
          }

          if (!hasIssues) {
            const allQcResolved = currentOrder.items.every(
              (entry) =>
                entry.qcStatus === "PASSED" ||
                entry.qcStatus === "BUYER_ACCEPTED",
            );
            const awaitingBuyerDecision = currentOrder.items.some(
              (entry) => entry.qcStatus === "FAILED_AWAITING_BUYER",
            );
            currentOrder.status = allQcResolved
              ? "PROCESSING"
              : awaitingBuyerDecision
                ? "AWAITING_BUYER_CONFIRMATION"
                : "QC_IN_PROGRESS";
          }

          await currentOrder.save({
            session,
            validateModifiedOnly: true,
          });

          if (hasIssues) {
            const sellerIds = [
              ...new Set(currentOrder.items.map((entry) => entry.sellerId.toString())),
            ];
            await reverseOrderGreenPointRewards({
              orderId: currentOrder._id.toString(),
              buyerId: currentOrder.buyerId.toString(),
              sellerIds,
              session,
            });
            await createQcCompensation({
              orderId: currentOrder._id.toString(),
              userId: currentOrder.buyerId.toString(),
              productId: productId.toString(),
              session,
            });
          }

          await Notification.create(
            [
              {
                recipientId: currentOrder.buyerId,
                senderId: new mongoose.Types.ObjectId(auth.user.id),
                type: "QC_UPDATE",
                title: hasIssues
                  ? "Order dibatalkan setelah QC"
                  : "QC selesai: barang lolos pemeriksaan",
                message: hasIssues
                  ? "Pemeriksaan menemukan masalah. Seluruh order dibatalkan dan nilai produk dikembalikan sebagai Green Points; kredit mungkin menunggu pendanaan reserve."
                  : "Pemeriksaan kualitas selesai dan barang siap diproses ke tahap berikutnya.",
                link: `/orders/${currentOrder._id.toString()}`,
                isRead: false,
              },
            ],
            { session },
          );

          if (hasIssues) {
            await Notification.insertMany(
              [...new Set(currentOrder.items.map((entry) => entry.sellerId.toString()))].map(
                (sellerId) => ({
                  recipientId: new mongoose.Types.ObjectId(sellerId),
                  senderId: new mongoose.Types.ObjectId(auth.user.id),
                  type: "ORDER_UPDATE",
                  title: "Items awaiting retrieval",
                  message: "The order was cancelled after the QC failure. Retrieve all items or request return delivery within 14 calendar days.",
                  link: `/orders/${currentOrder._id.toString()}`,
                  isRead: false,
                }),
              ),
              { session },
            );
          }

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

      if (error instanceof Error && error.message === "QC is unavailable while refund resolution is in progress.") {
        return NextResponse.json({ success: false, message: error.message }, { status: 409 });
      }
      return NextResponse.json(
        {
          success: false,
          message: "Could not save this QC assessment.",
        },
        { status: 500 },
      );
    }
  }
