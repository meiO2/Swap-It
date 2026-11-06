
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { requireAuth } from "@/lib/authorization";
import { connectDB } from "@/lib/mongodb";
import Cart from "@/models/Cart";
import Order, {
  type DeliveryMethod,
  type HandoverMethod,
  type HandoverStatus,
  type IOrderAddress,
  type IOrderItem,
} from "@/models/Order";
import Product from "@/models/Product";
import { getBiteshipCourierCode } from "@/lib/biteship";
import { getShippingRates, ShippingRequestError } from "@/lib/shipping";
import { getSwapHubs } from "@/lib/hubs";
import { getGreenPointBalance, redeemGreenPoints } from "@/lib/green-points";

const PAYMENT_EXPIRY_MINUTES = 30;

function isAddress(value: unknown): value is IOrderAddress {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;

  const address = value as Record<string, unknown>;

  return ["name", "phone", "address", "city", "postalCode"].every(
    (field) =>
      typeof address[field] === "string" && address[field].trim().length > 0,
  );
}

function isDeliveryMethod(value: unknown): value is DeliveryMethod {
  return value === "courier" || value === "pickup";
}

export async function GET() {
  try {
    const auth = await requireAuth();
    if (!auth.success) return auth.response;

    await connectDB();

    const userId = new mongoose.Types.ObjectId(auth.user.id);

    const orders = await Order.find({
      $or: [{ buyerId: userId }, { "items.sellerId": userId }],
    })
      .sort({ createdAt: -1 })
      .lean();

    const serializedOrders = orders.map((order) => ({
      ...order,
      id: order._id.toString(),
      items: order.items.map((item) => ({
        ...item,
        productId: item.productId.toString(),
        sellerId: item.sellerId.toString(),
      })),
    }));

    return NextResponse.json({ success: true, data: serializedOrders });
  } catch (error) {
    console.error("Get orders error:", error);

    return NextResponse.json(
      { success: false, message: "Failed to retrieve orders." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.success) return auth.response;

    await connectDB();

    const body = await request.json();

    if (!isDeliveryMethod(body?.deliveryMethod)) {
      return NextResponse.json(
        {
          success: false,
          message: "deliveryMethod must be courier or pickup.",
        },
        { status: 400 },
      );
    }

    if (
      body.deliveryMethod === "courier" &&
      !isAddress(body.shippingAddress)
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "A valid shippingAddress is required for courier delivery.",
        },
        { status: 400 },
      );
    }

    const session = await mongoose.startSession();

    const paymentSummary = {
      expiresAt: new Date(0),
      totalAmount: 0,
    };

    const responseOrder: { value: unknown } = {
      value: null,
    };

    try {
      await session.withTransaction(async () => {
        const cart = await Cart.findOne({
          userId: auth.user.id,
        }).session(session);

        if (!cart || cart.items.length === 0) {
          throw new Error("Your cart is empty.");
        }

        const productIds = cart.items.map((item) => item.productId);

        const products = await Product.find({
          _id: { $in: productIds },
          status: "AVAILABLE",
        }).session(session);

        if (products.length !== productIds.length) {
          throw new Error("One or more products are no longer available.");
        }

        const buyerId = auth.user.id;

        if (
          products.some(
            (product) => product.sellerId.toString() === buyerId,
          )
        ) {
          throw new Error("You cannot buy your own product.");
        }

        const items: IOrderItem[] = products.map((product) => {
          const isPickup = product.fulfillment === "Pickup";

          const method: HandoverMethod = isPickup
            ? "PICKUP"
            : "HUB_DROP_OFF";

          const status: HandoverStatus = "AWAITING_PAYMENT";

          return {
            productId: product._id,
            sellerId: product.sellerId,
            name: product.name,
            price: product.price,
            image: product.images[0],

            handover: {
              method,
              status,

              ...(isPickup && product.pickupAddress
                ? {
                    pickupAddress: {
                      name: product.pickupAddress.name,
                      phone: product.pickupAddress.phone,
                      address: product.pickupAddress.address,
                      city: product.pickupAddress.city,
                      postalCode: product.pickupAddress.postalCode,
                    },
                  }
                : {}),
            },
          };
        });

        const subtotal = items.reduce(
          (total, item) => total + item.price,
          0,
        );

        const shippingFee = 0;
        const serviceFee = 0;
        const gpUsed = 0;
        const totalAmount =
          subtotal + shippingFee + serviceFee - gpUsed;

        const expiresAt = new Date(
          Date.now() + PAYMENT_EXPIRY_MINUTES * 60 * 1000,
        );

        const createdOrder = new Order({
          buyerId: new mongoose.Types.ObjectId(auth.user.id),
          items,
          subtotal,
          shippingFee,
          serviceFee,
          gpUsed,
          totalAmount,
          deliveryMethod: body.deliveryMethod,

          shippingAddress:
            body.deliveryMethod === "courier"
              ? {
                  name: body.shippingAddress.name.trim(),
                  phone: body.shippingAddress.phone.trim(),
                  address: body.shippingAddress.address.trim(),
                  city: body.shippingAddress.city.trim(),
                  postalCode: body.shippingAddress.postalCode.trim(),
                }
              : undefined,

          status: "PENDING_PAYMENT",
          expiresAt,
        });

        await createdOrder.save({ session });

        responseOrder.value = createdOrder.toObject();

        paymentSummary.expiresAt = expiresAt;
        paymentSummary.totalAmount = totalAmount;

        const reserved = await Product.updateMany(
          {
            _id: { $in: productIds },
            status: "AVAILABLE",
          },
          {
            $set: { status: "RESERVED" },
          },
          { session },
        );

        if (reserved.modifiedCount !== productIds.length) {
          throw new Error("Products changed availability during checkout.");
        }

        await Cart.updateOne(
          { userId: auth.user.id },
          { $set: { items: [] } },
          { session },
        );
      });
    } finally {
      await session.endSession();
    }

    return NextResponse.json(
      {
        success: true,
        message: "Order created and products reserved.",
        data: responseOrder.value,
        payment: {
          status: "PENDING_PAYMENT",
          expiresAt: paymentSummary.expiresAt,
          amount: paymentSummary.totalAmount,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create order.";

    const status = [
      "Your cart is empty.",
      "One or more products are no longer available.",
      "You cannot buy your own product.",
      "Products changed availability during checkout.",
    ].includes(message)
      ? 409
      : error instanceof ShippingRequestError
        ? 400
      : 500;

    console.error("Create order error:", error);

    return NextResponse.json(
      {
        success: false,
        message: status === 500 ? "Failed to create order." : message,
      },
      { status },
    );
  }
}
