import { NextResponse } from "next/server";
import { requireRole } from "@/lib/authorization";
import { connectDB } from "@/lib/mongodb";
import Order from "@/models/Order";
import Listing from "@/models/Listing";
import { catalogProducts } from "@/data/mock";

export async function GET() {
  const auth = await requireRole(["ADMIN", "INSPECTOR"]);
  if (!auth.success) return auth.response;
  try {
    await connectDB();
    const [orders, listings] = await Promise.all([
      Order.find({ status: "Processing", qcStatus: "pending" }).sort({ createdAt: 1 }).lean(),
      Listing.find({ status: { $in: ["Submitted", "Sorting"] } }).sort({ createdAt: 1 }).lean(),
    ]);
    const orderItems = orders.map((order) => {
      const firstItem = order.items[0];
      return {
        type: "order" as const,
        id: String(order._id),
        createdAt: order.createdAt,
        category: catalogProducts.find((product) => product.id === firstItem?.productId)?.category ?? "Unknown",
        title: catalogProducts.find((product) => product.id === firstItem?.productId)?.name ?? "Marketplace item",
        quantity: firstItem?.quantity ?? 1,
        value: order.productValue,
        delivery: order.delivery,
        items: order.items,
      };
    });
    const listingItems = listings.map((listing) => ({
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
    return NextResponse.json({ success: true, data: [...orderItems, ...listingItems] });
  } catch (error) {
    console.error("Get QC queue error:", error);
    return NextResponse.json({ success: false, message: "Could not load the QC queue." }, { status: 500 });
  }
}
