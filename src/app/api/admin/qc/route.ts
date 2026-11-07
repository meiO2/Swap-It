
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

    const orders = await Order.find({
      status: "PROCESSING",
    })
      .sort({ createdAt: 1 })
      .lean();

    // Only received Swap Hub drop-offs are eligible for QC.
    const orderItems = orders.flatMap((order) =>
      order.items
        .filter(
          (item) =>
            item.handover?.method === "HUB_DROP_OFF" &&
            item.handover?.status === "RECEIVED",
        )
        .map((item) => ({
          orderId: order._id,
          createdAt: order.createdAt,
          productId: item.productId,
          name: item.name,
          price: item.price,
          image: item.image,
          handover: item.handover,
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

    const reviewedProducts = new Set(
      assessments
        .filter((assessment) => assessment.productId)
        .map(
          (assessment) =>
            `${String(assessment.entityId)}:${String(assessment.productId)}`,
        ),
    );

    const data = orderItems
      .filter(
        (item) =>
          !reviewedProducts.has(
            `${String(item.orderId)}:${String(item.productId)}`,
          ),
      )
      .map((item) => {
        const product = productMap.get(String(item.productId));

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
          fulfillment: "HUB_DROP_OFF",
          handover: {
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
