
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { requireAuth } from "@/lib/authorization";
import { connectDB } from "@/lib/mongodb";
import Cart from "@/models/Cart";
import Order, {
  type HandoverMethod,
  type HandoverStatus,
  type IOrderAddress,
  type IOrderItem,
} from "@/models/Order";
import Product from "@/models/Product";
import { getBiteshipCourierCode } from "@/lib/biteship";
import { getShippingRates, ShippingRequestError } from "@/lib/shipping";
import { getGreenPointBalance, redeemGreenPoints } from "@/lib/green-points";
import { calculateBuyerServiceFee } from "@/lib/fees";

const PAYMENT_EXPIRY_MINUTES = 30;

function isAddress(value: unknown): value is IOrderAddress {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;

  const address = value as Record<string, unknown>;

  return ["name", "phone", "address", "city", "postalCode"].every(
    (field) =>
      typeof address[field] === "string" && address[field].trim().length > 0,
  );
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

    if (body?.deliveryMethod !== "courier") {
      return NextResponse.json(
        {
          success: false,
          message: "Buyer orders must use courier delivery.",
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

    const requestedGp = body.gpUsed === undefined ? 0 : body.gpUsed;
    if (!Number.isSafeInteger(requestedGp) || requestedGp < 0) {
      return NextResponse.json(
        { success: false, message: "gpUsed must be a non-negative integer." },
        { status: 400 },
      );
    }

    let shippingFee = 0;
    let courierName: string | undefined;
    let courierServiceCode: string | undefined;
    let courierService: string | undefined;
    let estimatedDeliveryTime: string | undefined;
    const shippingMode =
      process.env.SHIPPING_MODE === "biteship" ? "biteship" : "mock";
    let courierCode =
      typeof body.courierCode === "string"
        ? getBiteshipCourierCode(body.courierCode)
        : undefined;

    if (body.deliveryMethod === "courier") {
      const currentCart = await Cart.findOne({ userId: auth.user.id }).lean();
      const currentProducts = await Product.find({
        _id: { $in: currentCart?.items.map((item) => item.productId) ?? [] },
        status: "AVAILABLE",
      }).lean();
      const rates = await getShippingRates({
        destinationPostalCode: body.shippingAddress.postalCode,
        items: currentProducts.map((product) => ({
          name: product.name,
          value: product.price,
          quantity: 1,
        })),
      });
      const selectedRate =
        rates.find((rate) => rate.courier_code === courierCode) ?? rates[0];
      if (!selectedRate?.price || !selectedRate.courier_code) {
        return NextResponse.json(
          {
            success: false,
            message: "No shipping rate is available for this address.",
          },
          { status: 409 },
        );
      }
      shippingFee = selectedRate.price;
      courierCode = selectedRate.courier_code;
      courierName = selectedRate.courier_name;
      courierServiceCode = selectedRate.courier_service_code;
      courierService = selectedRate.courier_service_name;
      estimatedDeliveryTime = selectedRate.duration;
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
            listingPriceSnapshot: product.price,

            handover: {
              method,
              status,
              rescheduleCount: 0,
              rescheduleHistory: [],

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

        // Service fee is paid in currency, never with Green Points.
        const serviceFee = calculateBuyerServiceFee(subtotal);
        const availableGp = await getGreenPointBalance(
          auth.user.id,
          new Date(),
          session,
        );
        const gpUsed = Math.min(requestedGp, subtotal);
        if (gpUsed > availableGp) {
          throw new Error(
            `Insufficient Green Points: ${availableGp} GP available.`,
          );
        }
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
          courierCode:
            body.deliveryMethod === "courier" ? courierCode : undefined,
          courierName,
          courierServiceCode,
          courierService,
          estimatedDeliveryTime,
          shippingMode:
            body.deliveryMethod === "courier" ? shippingMode : undefined,
          shippingOrigin:
            body.deliveryMethod === "courier"
              ? {
                  label: "SwapIt origin",
                  postalCode:
                    process.env.BITESHIP_ORIGIN_POSTAL_CODE ?? "15339",
                }
              : undefined,

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

        await redeemGreenPoints({
          userId: auth.user.id,
          amount: gpUsed,
          referenceKey: `order:${createdOrder._id.toString()}`,
          session,
        });

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
