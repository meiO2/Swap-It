
import { NextResponse } from "next/server";

import { requireRole } from "@/lib/authorization";
import { connectDB } from "@/lib/mongodb";

import Order from "@/models/Order";
import Product from "@/models/Product";
import QCAssessment from "@/models/QCAssessment";

export async function GET() {
  const auth = await requireRole(["ADMIN", "INSPECTOR"]);

  if (!auth.success) return auth.response;

  try {
    await connectDB();

    // Receipt is the source of truth for QC eligibility. This also keeps the
    // queue resilient when a legacy order has not yet had its parent status
    // migrated to QC_IN_PROGRESS.
    const orders = await Order.find({
      $or: [
        { "items.handover.status": "RECEIVED" },
        { "items.qcStatus": "PENDING" },
        { status: "RECEIVED", "items.qcStatus": { $nin: ["PASSED", "FAILED_AWAITING_BUYER", "BUYER_ACCEPTED", "BUYER_REJECTED", "EXPIRED"] } },
        { status: "QC_IN_PROGRESS", "items.qcStatus": { $nin: ["PASSED", "FAILED_AWAITING_BUYER", "BUYER_ACCEPTED", "BUYER_REJECTED", "EXPIRED"] } },
      ],
    })
      .sort({ createdAt: 1 })
      .lean();

    // Only received Swap Hub drop-offs are eligible for QC.
    const orderItems = orders.flatMap((order) =>
      order.items
        .filter(
          (item) =>
            item.handover?.status === "RECEIVED" ||
            item.qcStatus === "PENDING" ||
            ((order.status === "RECEIVED" || order.status === "QC_IN_PROGRESS") &&
              !item.qcAssessmentId &&
              !["PASSED", "FAILED_AWAITING_BUYER", "BUYER_ACCEPTED", "BUYER_REJECTED", "EXPIRED"].includes(item.qcStatus ?? "")),
        )
        .map((item) => ({
          orderId: order._id,
          createdAt: order.createdAt,
          productId: item.productId,
          name: item.name,
          price: item.price,
          image: item.image,
          handover: item.handover,
          qcStatus: item.qcStatus ?? "NOT_STARTED",
          qcAssessmentId: item.qcAssessmentId,
          qcDecisionDeadline: item.qcDecisionDeadline,
          buyerQcDecision: item.buyerQcDecision,
          buyerQcDecisionAt: item.buyerQcDecisionAt,
        })),
    );

    const productIds = orderItems.map((item) => item.productId);

    const [products, assessments] = await Promise.all([
      Product.find({
        _id: { $in: productIds },
      }).lean(),

      QCAssessment.find({
        entityType: "order",
        entityId: { $in: orders.map((order) => order._id) },
      }).lean(),
    ]);

    const productMap = new Map(
      products.map((product) => [
        String(product._id),
        product,
      ]),
    );

    const data = orderItems.map((item) => {
        const product = productMap.get(String(item.productId));
        const assessment = assessments.find(
          (candidate) =>
            String(candidate.entityId) === String(item.orderId) &&
            String(candidate.productId) === String(item.productId),
        );

        return {
          type: "order" as const,
          id: String(item.orderId),
          productId: String(item.productId),
          createdAt: item.createdAt,
          category: product?.category ?? "Unknown",
          title: product?.name ?? item.name,
          quantity: 1,
          value: item.price,
          image: product?.images?.[0] ?? item.image,
          size: product?.size,
          condition: product?.condition,
          description: product?.description,
          fulfillment: item.handover?.method,
          qcStatus: item.qcStatus,
          buyerQcDecision: item.buyerQcDecision,
          qcDecisionDeadline: item.qcDecisionDeadline,
          qcAssessment: assessment
            ? {
                decision: assessment.decision,
                notes: assessment.notes,
                evidenceUrls: assessment.evidenceUrls ?? [],
                answers: assessment.answers,
              }
            : null,
          handover: {
            method: item.handover?.method,
            hubId: item.handover?.hubId,
            hubName: item.handover?.hubName,
            status: item.handover?.status,
            scheduledAt: item.handover?.scheduledAt,
          },
        };
      })
      .sort(
        (a, b) =>
          new Date(a.createdAt ?? 0).getTime() -
          new Date(b.createdAt ?? 0).getTime(),
      );

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Get QC queue error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Could not load the QC queue.",
      },
      { status: 500 },
    );
  }
}
