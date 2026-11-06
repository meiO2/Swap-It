
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/authorization";
import { connectDB } from "@/lib/mongodb";
import Order from "@/models/Order";
import Listing from "@/models/Listing";
import Product from "@/models/Product";
import QCAssessment from "@/models/QCAssessment";

export async function GET() {
  const auth = await requireRole(["ADMIN", "INSPECTOR"]);

  if (!auth.success) return auth.response;

  try {
    await connectDB();

    // Find orders currently being processed.
    const orders = await Order.find({
      status: "PROCESSING",
    })
      .sort({ createdAt: 1 })
      .lean();

    // Find listings awaiting inspection.
    const listings = await Listing.find({
      status: { $in: ["Submitted", "Sorting"] },
    })
      .sort({ createdAt: 1 })
      .lean();

    // Collect product IDs from received hub handovers.
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

    // Fetch actual product information.
    const products = await Product.find({
      _id: { $in: productIds },
    }).lean();

    const productMap = new Map(
      products.map((product) => [
        String(product._id),
        product,
      ]),
    );

    // Exclude products and listings that already have QC assessments.
    const [orderAssessments, listingAssessments] = await Promise.all([
      QCAssessment.find({
        entityType: "order",
        entityId: { $in: orders.map((order) => order._id) },
      }).lean(),

      QCAssessment.find({
        entityType: "listing",
        entityId: { $in: listings.map((listing) => listing._id) },
      }).lean(),
    ]);

    const reviewedProducts = new Set(
      orderAssessments
        .filter((assessment) => assessment.productId)
        .map(
          (assessment) =>
            `${String(assessment.entityId)}:${String(assessment.productId)}`,
        ),
    );

    const reviewedListings = new Set(
      listingAssessments.map((assessment) =>
        String(assessment.entityId),
      ),
    );

    // Build one QC queue entry per received product.
    const orderQueue = orderItems
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
      });

    const listingQueue = listings
      .filter(
        (listing) => !reviewedListings.has(String(listing._id)),
      )
      .map((listing) => ({
        type: "listing" as const,
        id: String(listing._id),
        createdAt: listing.createdAt,
        category: listing.category,
        title: listing.title,
        image: listing.image,
        size: listing.size,
        condition: listing.condition,
        description: listing.description,
        value: listing.price,
        fulfillment: listing.fulfillment,
      }));

    const data = [...orderQueue, ...listingQueue].sort(
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
