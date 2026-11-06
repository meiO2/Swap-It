import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { requireAuth } from "@/lib/authorization";
import { connectDB } from "@/lib/mongodb";
import {
  chargeCoreTransaction,
  createSnapTransaction,
  getMidtransTransactionStatus,
  type CorePaymentMethod,
} from "@/lib/midtrans";
import Cart from "@/models/Cart";
import Order from "@/models/Order";
import Payment from "@/models/Payment";
import Product from "@/models/Product";
import User from "@/models/User";
import { awardGreenPoints, GREEN_POINT_REWARDS } from "@/lib/green-points";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.success) return auth.response;
    await connectDB();

    const body = await request.json();
    const orderId = body?.orderId;
    if (
      typeof orderId !== "string" ||
      !mongoose.Types.ObjectId.isValid(orderId)
    ) {
      return NextResponse.json(
        { success: false, message: "A valid orderId is required." },
        { status: 400 },
      );
    }

    const order = await Order.findOne({
      _id: orderId,
      buyerId: auth.user.id,
      status: "PENDING_PAYMENT",
    }).lean();
    if (!order) {
      return NextResponse.json(
        { success: false, message: "Pending payment order not found." },
        { status: 404 },
      );
    }
    if (order.expiresAt <= new Date()) {
      return NextResponse.json(
        { success: false, message: "This order's payment window has expired." },
        { status: 409 },
      );
    }

    const existing = await Payment.findOne({ orderId: order._id }).lean();
    if (existing?.status === "PENDING" && existing.snapToken && !body?.paymentMethod) {
      return NextResponse.json({
        success: true,
        data: {
          paymentId: existing._id,
          orderId: existing.orderId,
          status: existing.status,
          snapToken: existing.snapToken,
          redirectUrl: existing.redirectUrl,
          grossAmount: existing.grossAmount,
        },
      });
    }
    if (existing?.status === "PENDING" && existing.paymentData && body?.paymentMethod) {
      return NextResponse.json({
        success: true,
        data: {
          paymentId: existing._id,
          orderId: existing.orderId,
          status: existing.status,
          paymentType: existing.paymentType,
          paymentData: existing.paymentData,
          grossAmount: existing.grossAmount,
        },
      });
    }
    if (existing && existing.status !== "PENDING") {
      return NextResponse.json(
        { success: false, message: "This order already has a final payment status." },
        { status: 409 },
      );
    }

    const user = await User.findById(auth.user.id).select("name email").lean();
    if (!user) {
      return NextResponse.json(
        { success: false, message: "Buyer account not found." },
        { status: 404 },
      );
    }

    const midtransOrderId = `swapit-${order._id.toString()}`;
    const itemDetails = order.items.map((item) => ({
      id: item.productId.toString(),
      price: item.price,
      quantity: 1,
      name: item.name,
    }));
    if (order.shippingFee > 0) {
      itemDetails.push({
        id: "shipping",
        price: order.shippingFee,
        quantity: 1,
        name: "Shipping fee",
      });
    }
    if (order.serviceFee > 0) {
      itemDetails.push({
        id: "service-fee",
        price: order.serviceFee,
        quantity: 1,
        name: "Service fee",
      });
    }
    if (order.gpUsed > 0) {
      itemDetails.push({
        id: "green-points",
        price: -order.gpUsed,
        quantity: 1,
        name: "Green Points discount",
      });
    }

    const customPaymentMethod = body?.paymentMethod as CorePaymentMethod | undefined;
    if (customPaymentMethod) {
      const supportedMethods: CorePaymentMethod[] = [
        "bca_va", "bni_va", "bri_va", "mandiri_va", "permata_va",
        "qris", "gopay", "shopeepay", "indomaret", "alfamart", "credit_card",
      ];
      if (!supportedMethods.includes(customPaymentMethod)) {
        return NextResponse.json(
          { success: false, message: "Unsupported payment method." },
          { status: 400 },
        );
      }
      let charge;
      try {
        charge = await chargeCoreTransaction({
          orderId: midtransOrderId,
          grossAmount: order.totalAmount,
          paymentMethod: customPaymentMethod,
          tokenId: typeof body.tokenId === "string" ? body.tokenId : undefined,
          itemDetails,
          customer: { firstName: user.name, email: user.email },
        });
      } catch (error) {
        const session = await mongoose.startSession();
        try {
          await session.withTransaction(async () => {
            await Order.updateOne(
              { _id: order._id, status: "PENDING_PAYMENT" },
              { $set: { status: "CANCELLED" } },
              { session },
            );
            await Product.updateMany(
              { _id: { $in: order.items.map((item) => item.productId) }, status: "RESERVED" },
              { $set: { status: "AVAILABLE" } },
              { session },
            );
            await Cart.findOneAndUpdate(
              { userId: auth.user.id },
              {
                $setOnInsert: { userId: auth.user.id },
                $addToSet: {
                  items: {
                    $each: order.items.map((item) => ({ productId: item.productId, addedAt: new Date() })),
                  },
                },
              },
              { upsert: true, session },
            );
            if (order.gpUsed > 0) {
              await awardGreenPoints({
                userId: auth.user.id,
                amount: order.gpUsed,
                type: "REFUND",
                description: "Green Points returned after payment creation failed",
                referenceKey: `order:${order._id.toString()}:gp-refund`,
                session,
              });
            }
          });
        } finally {
          await session.endSession();
        }
        throw error;
      }
      const payment = await Payment.findOneAndUpdate(
        { orderId: order._id },
        {
          $set: {
            userId: order.buyerId,
            midtransOrderId,
            grossAmount: order.totalAmount,
            status: "PENDING",
            transactionId: charge.transaction_id,
            paymentType: charge.payment_type ?? customPaymentMethod,
            paymentData: charge,
          },
        },
        { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
      );
      return NextResponse.json({
        success: true,
        data: {
          paymentId: payment._id,
          orderId: payment.orderId,
          status: payment.status,
          paymentType: payment.paymentType,
          paymentData: payment.paymentData,
          grossAmount: payment.grossAmount,
        },
      });
    }

    let snap;
    try {
      snap = await createSnapTransaction({
        orderId: midtransOrderId,
        grossAmount: order.totalAmount,
        itemDetails,
        customer: {
          firstName: user.name,
          email: user.email,
        },
        finishUrl: `${new URL(request.url).origin}/payment/result?orderId=${order._id.toString()}`,
      });
    } catch (error) {
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          await Order.updateOne(
            { _id: order._id, status: "PENDING_PAYMENT" },
            { $set: { status: "CANCELLED" } },
            { session },
          );
          await Product.updateMany(
            { _id: { $in: order.items.map((item) => item.productId) }, status: "RESERVED" },
            { $set: { status: "AVAILABLE" } },
            { session },
          );
          await Cart.findOneAndUpdate(
            { userId: auth.user.id },
            {
              $setOnInsert: { userId: auth.user.id },
              $addToSet: {
                items: {
                  $each: order.items.map((item) => ({
                    productId: item.productId,
                    addedAt: new Date(),
                  })),
                },
              },
            },
            { upsert: true, session },
          );
          if (order.gpUsed > 0) {
            await awardGreenPoints({
              userId: auth.user.id,
              amount: order.gpUsed,
              type: "REFUND",
              description: "Green Points returned after payment creation failed",
              referenceKey: `order:${order._id.toString()}:gp-refund`,
              session,
            });
          }
        });
      } finally {
        await session.endSession();
      }
      throw error;
    }

    const payment = await Payment.findOneAndUpdate(
      { orderId: order._id },
      {
        $set: {
          userId: order.buyerId,
          midtransOrderId,
          grossAmount: order.totalAmount,
          status: "PENDING",
          snapToken: snap.token,
          redirectUrl: snap.redirect_url,
        },
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    );

    return NextResponse.json({
      success: true,
      data: {
        paymentId: payment._id,
        orderId: payment.orderId,
        status: payment.status,
        snapToken: payment.snapToken,
        redirectUrl: payment.redirectUrl,
        grossAmount: payment.grossAmount,
      },
    });
  } catch (error) {
    console.error("Create payment error:", error);
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Failed to create payment.",
      },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.success) return auth.response;
    await connectDB();
    const orderId = new URL(request.url).searchParams.get("orderId");
    const query: { userId: string; orderId?: string } = {
      userId: auth.user.id,
    };
    if (orderId) {
      if (!mongoose.Types.ObjectId.isValid(orderId)) {
        return NextResponse.json(
          { success: false, message: "Invalid orderId." },
          { status: 400 },
        );
      }
      query.orderId = orderId;
    }
    let payments = await Payment.find(query)
      .sort({ createdAt: -1 })
      .lean();

    const pending = payments.find((payment) => payment.status === "PENDING");
    if (pending) {
      try {
        const status = await getMidtransTransactionStatus(pending.midtransOrderId);
        const isPaid =
          status.transaction_status === "settlement" ||
          (status.transaction_status === "capture" &&
            status.fraud_status !== "challenge");
        const finalStatus = isPaid
          ? "PAID"
          : status.transaction_status === "expire"
            ? "EXPIRED"
            : status.transaction_status === "cancel" || status.transaction_status === "deny"
              ? "CANCELED"
              : "PENDING";

        if (finalStatus !== "PENDING") {
          await Payment.updateOne(
            { _id: pending._id, status: "PENDING" },
            {
              $set: {
                status: finalStatus,
                transactionId: status.transaction_id,
                paymentType: status.payment_type,
                paidAt: finalStatus === "PAID" ? new Date() : undefined,
              },
            },
          );
          await Order.updateOne(
            { _id: pending.orderId, status: "PENDING_PAYMENT" },
            { $set: { status: finalStatus === "PAID" ? "PAID" : finalStatus === "EXPIRED" ? "EXPIRED" : "CANCELLED" } },
          );
          if (finalStatus === "PAID") {
            const paidOrder = await Order.findById(pending.orderId).lean();
            if (paidOrder) {
              const reward = Math.floor(paidOrder.subtotal * GREEN_POINT_REWARDS.purchaseRate);
              if (reward > 0) {
                await awardGreenPoints({
                  userId: paidOrder.buyerId.toString(),
                  amount: reward,
                  description: "Completed marketplace purchase reward",
                  referenceKey: `purchase:${paidOrder._id.toString()}`,
                });
              }
            }
          }
          payments = await Payment.find(query).sort({ createdAt: -1 }).lean();
        }
      } catch (error) {
        console.error("Could not synchronize Midtrans payment status.", error);
      }
    }

    return NextResponse.json({ success: true, data: payments });
  } catch (error) {
    console.error("Get payments error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to retrieve payments." },
      { status: 500 },
    );
  }
}
