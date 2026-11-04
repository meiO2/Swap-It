import { NextResponse, type NextRequest } from "next/server";
import { catalogProducts, swapHubs } from "@/data/mock";
import { couriers } from "@/data/couriers";
import { requireAuth } from "@/lib/authorization";
import { buildTimeline, estimateArrival, generatePickupCode, type OrderShape } from "@/lib/orders";
import { connectDB } from "@/lib/mongodb";
import Order from "@/models/Order";
import User from "@/models/User";

const serviceFee = 5000;

export async function GET() {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;
  try {
    await connectDB();
    const orders = await Order.find({ userId: auth.user.id }).sort({ createdAt: -1 }).lean();
    return NextResponse.json({ success: true, data: orders.map((order) => ({ ...order, id: String(order._id) })) });
  } catch (error) {
    console.error("Get orders error:", error);
    return NextResponse.json({ success: false, message: "Could not load your orders." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;
  try {
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null || Array.isArray(body)) return NextResponse.json({ success: false, message: "Provide valid order details." }, { status: 400 });
    const input = body as Record<string, unknown>;
    if (!Array.isArray(input.items) || input.items.length === 0 || typeof input.delivery !== "object" || input.delivery === null || Array.isArray(input.delivery)) {
      return NextResponse.json({ success: false, message: "Add at least one product and choose a delivery method." }, { status: 400 });
    }
    const itemsInput = input.items as Array<Record<string, unknown>>;
    const items: OrderShape["items"] = [];
    for (const item of itemsInput) {
      const product = catalogProducts.find((entry) => entry.id === item.productId);
      if (!product || !Number.isInteger(item.quantity) || Number(item.quantity) < 1 || Number(item.quantity) > 20) {
        return NextResponse.json({ success: false, message: "One or more cart items are invalid." }, { status: 400 });
      }
      items.push({ productId: product.id, quantity: Number(item.quantity), productValue: product.price * Number(item.quantity) });
    }
    const deliveryInput = input.delivery as Record<string, unknown>;
    await connectDB();
    let delivery: NonNullable<OrderShape["delivery"]>;
    let shippingFee = 0;
    let estimatedArrival: string | undefined;
    if (deliveryInput.method === "courier") {
      if (typeof deliveryInput.courierId !== "string" || typeof deliveryInput.addressId !== "string") {
        return NextResponse.json({ success: false, message: "Choose a courier and a saved delivery address." }, { status: 400 });
      }
      const courier = couriers.find((entry) => entry.id === deliveryInput.courierId);
      const user = await User.findById(auth.user.id).select("addresses").lean();
      const address = user?.addresses.find((entry) => entry.id === deliveryInput.addressId);
      if (!courier || !address) return NextResponse.json({ success: false, message: "Courier or saved address not found." }, { status: 400 });
      shippingFee = courier.fee;
      delivery = {
        method: "courier",
        courier: { id: courier.id, name: courier.name, fee: courier.fee, minDays: courier.minDays, maxDays: courier.maxDays },
        address,
      };
    } else if (deliveryInput.method === "pickup" && typeof deliveryInput.hubId === "string") {
      const hub = swapHubs.find((entry) => entry.id === deliveryInput.hubId);
      if (!hub) return NextResponse.json({ success: false, message: "Choose a valid Swap Hub." }, { status: 400 });
      delivery = { method: "pickup", hub, pickupCode: generatePickupCode() };
    } else {
      return NextResponse.json({ success: false, message: "Choose a valid delivery method." }, { status: 400 });
    }
    const productValue = items.reduce((total, item) => total + item.productValue, 0);
    const createdAt = new Date().toISOString();
    if (delivery.courier) estimatedArrival = estimateArrival(createdAt, delivery.courier.minDays, delivery.courier.maxDays).to;
    const timeline = buildTimeline(delivery.method, createdAt, 0);
    const order = await Order.create({
      userId: auth.user.id,
      items,
      productValue,
      shippingFee,
      serviceFee,
      gpUsed: 0,
      moneyPaid: productValue + shippingFee + serviceFee,
      status: "Processing",
      createdAt,
      rewardGranted: false,
      delivery,
      timeline,
      estimatedArrival,
      qcStatus: "pending",
      rewardEligible: true,
    });
    return NextResponse.json({ success: true, data: { ...order.toObject(), id: String(order._id) } }, { status: 201 });
  } catch (error) {
    console.error("Create order error:", error);
    return NextResponse.json({ success: false, message: "Could not place this order." }, { status: 500 });
  }
}
