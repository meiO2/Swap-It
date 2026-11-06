import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/authorization";
import { connectDB } from "@/lib/mongodb";
import Cart from "@/models/Cart";
import Product from "@/models/Product";
import { getShippingRates, ShippingRequestError, type ShippingItem } from "@/lib/shipping";

export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    if (!auth.success) return auth.response;
    const body = await request.json() as {
      originPostalCode?: string;
      destinationPostalCode?: string;
      couriers?: string;
      items?: ShippingItem[];
    };
    if (!body.destinationPostalCode) {
      return NextResponse.json({ success: false, message: "Destination postal code is required." }, { status: 400 });
    }

    await connectDB();
    const cart = await Cart.findOne({ userId: auth.user.id }).lean();
    const products = await Product.find({
      _id: { $in: cart?.items.map((item) => item.productId) ?? [] },
      status: "AVAILABLE",
    }).lean();
    const rates = await getShippingRates({
      originPostalCode: body.originPostalCode,
      destinationPostalCode: body.destinationPostalCode,
      couriers: body.couriers,
      items: body.items ?? products.map((product) => ({
        name: product.name,
        value: product.price,
        quantity: 1,
      })),
    });
    return NextResponse.json({ success: true, data: rates });
  } catch (error) {
    console.error("Get shipping rates error:", error);
    const message = error instanceof Error ? error.message : "Failed to get shipping rates.";
    return NextResponse.json({ success: false, message }, { status: error instanceof ShippingRequestError ? 400 : 500 });
  }
}
