import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { requireAuth } from "@/lib/authorization";
import { connectDB } from "@/lib/mongodb";
import {
  createXenditQrCode,
  getXenditQrCode,
  getXenditPaymentSession,
  type XenditQrCode,
} from "@/lib/xendit";
import Cart from "@/models/Cart";
import Order from "@/models/Order";
import Payment from "@/models/Payment";
import Product from "@/models/Product";
import { awardGreenPoints, GREEN_POINT_REWARDS } from "@/lib/green-points";
import { createNotificationsForMany } from "@/lib/notifications";

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
    if (existing?.status === "PENDING" && existing.xenditQrString) {
      return NextResponse.json({
        success: true,
        data: {
          paymentId: existing._id,
          orderId: existing.orderId,
          status: existing.status,
          qrCodeId: existing.xenditQrCodeId,
          qrString: existing.xenditQrString,
          grossAmount: existing.grossAmount,
        },
      });
    }
    if (existing?.status === "PENDING" && existing.redirectUrl) {
      return NextResponse.json({
        success: true,
        data: {
          paymentId: existing._id,
          orderId: existing.orderId,
          status: existing.status,
          redirectUrl: existing.redirectUrl,
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

    const referenceId = `swapit-${order._id.toString()}`;
    let qrCode: XenditQrCode;
    try {
      const callbackUrl = `${new URL(request.url).origin}/api/payments/webhook`;
      try {
        qrCode = await createXenditQrCode({
          externalId: referenceId,
          callbackUrl,
          amount: order.totalAmount,
        });
      } catch (error) {
        const existingQrCode = await getXenditQrCode(referenceId).catch(() => null);
        if (
          !existingQrCode ||
          existingQrCode.external_id !== referenceId ||
          existingQrCode.amount !== order.totalAmount
        ) {
          throw error;
        }
        qrCode = existingQrCode;
      }
      if (!qrCode.qr_string) {
        throw new Error("Xendit did not return a QRIS payment code.");
      }
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
          // Keep the existing unique MongoDB index populated during migration.
          midtransOrderId: referenceId,
          xenditQrCodeId: qrCode.id,
          xenditQrString: qrCode.qr_string,
          xenditReferenceId: qrCode.external_id,
          grossAmount: order.totalAmount,
          status: "PENDING",
        },
        $unset: {
          xenditSessionId: 1,
          xenditPaymentRequestId: 1,
          redirectUrl: 1,
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
        qrCodeId: payment.xenditQrCodeId,
        qrString: payment.xenditQrString,
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

    const pending = payments.find(
      (payment) =>
        payment.status === "PENDING" &&
        (payment.xenditSessionId || payment.xenditQrCodeId),
    );
    if (pending) {
      try {
        let finalStatus: "PAID" | "EXPIRED" | "PENDING";
        let transactionId: string | undefined;
        let paymentRequestId: string | undefined;
        if (pending.xenditSessionId) {
          const session = await getXenditPaymentSession(pending.xenditSessionId);
          if (
            session.reference_id !== pending.xenditReferenceId ||
            session.amount !== pending.grossAmount
          ) {
            throw new Error("Xendit payment session does not match the stored order.");
          }
          finalStatus =
            session.status === "COMPLETED"
              ? "PAID"
              : session.status === "EXPIRED"
                ? "EXPIRED"
                : "PENDING";
          transactionId = session.payment_id ?? undefined;
          paymentRequestId =
            session.latest_payment_request_id ??
            session.payment_request_id ??
            undefined;
        } else if (pending.xenditReferenceId && pending.xenditQrCodeId) {
          const qrCode = await getXenditQrCode(pending.xenditReferenceId);
          if (
            qrCode.external_id !== pending.xenditReferenceId ||
            qrCode.id !== pending.xenditQrCodeId ||
            qrCode.amount !== pending.grossAmount
          ) {
            throw new Error("Xendit QR code does not match the stored order.");
          }
          finalStatus = qrCode.status === "INACTIVE" ? "PAID" : "PENDING";
        } else {
          throw new Error("Xendit payment reference is missing.");
        }

        if (finalStatus !== "PENDING") {
          const session = await mongoose.startSession();
          try {
            await session.withTransaction(async () => {
              const updated = await Payment.findOneAndUpdate(
                { _id: pending._id, status: "PENDING" },
                {
                  $set: {
                    status: finalStatus,
                    transactionId,
                    xenditPaymentRequestId: paymentRequestId,
                    paidAt: finalStatus === "PAID" ? new Date() : undefined,
                  },
                },
                { new: true, session },
              );
              if (!updated) return;

              if (finalStatus === "PAID") {
                const handoverDeadline = new Date(
                  Date.now() + 3 * 24 * 60 * 60 * 1000,
                );
                await Order.updateOne(
                  { _id: pending.orderId, status: "PENDING_PAYMENT" },
                  {
                    $set: {
                      status: "AWAITING_SELLER_HANDOVER",
                      "items.$[].handover.status": "AWAITING_SELLER_SCHEDULE",
                      "items.$[].handoverDeadline": handoverDeadline,
                    },
                  },
                  { session },
                );
                const paidOrder = await Order.findById(pending.orderId)
                  .session(session)
                  .lean();
                if (paidOrder) {
                  await Product.updateMany(
                    {
                      _id: { $in: paidOrder.items.map((item) => item.productId) },
                      status: "RESERVED",
                    },
                    { $set: { status: "SOLD_PENDING_HANDOVER" } },
                    { session },
                  );
                  const sellerIds = [
                    ...new Set(
                      paidOrder.items.map((item) => item.sellerId.toString()),
                    ),
                  ];
                  await createNotificationsForMany({
                    recipientIds: sellerIds,
                    senderId: paidOrder.buyerId.toString(),
                    type: "ORDER_UPDATE",
                    title: "New order received",
                    message:
                      "A buyer has placed an order for your product. Please choose drop-off or pickup and hand it over within 3 calendar days.",
                    link: "/orders",
                    session,
                  });
                  const reward = Math.floor(
                    paidOrder.subtotal * GREEN_POINT_REWARDS.purchaseRate,
                  );
                  if (reward > 0) {
                    await awardGreenPoints({
                      userId: paidOrder.buyerId.toString(),
                      amount: reward,
                      description: "Completed marketplace purchase reward",
                      referenceKey: `purchase:${paidOrder._id.toString()}`,
                      session,
                    });
                  }
                }
              } else {
                await Order.updateOne(
                  { _id: pending.orderId, status: "PENDING_PAYMENT" },
                  { $set: { status: "EXPIRED" } },
                  { session },
                );
                const cancelledOrder = await Order.findById(pending.orderId)
                  .session(session);
                if (cancelledOrder) {
                  await createNotificationsForMany({
                    recipientIds: [cancelledOrder.buyerId.toString()],
                    type: "ORDER_UPDATE",
                    title: "Payment expired",
                    message:
                      "Your payment has expired. Your order has been cancelled.",
                    link: "/orders",
                    session,
                  });
                }
                await Product.updateMany(
                  {
                    _id:
                      cancelledOrder?.items.map((item) => item.productId) ?? [],
                    status: "RESERVED",
                  },
                  { $set: { status: "AVAILABLE" } },
                  { session },
                );
                if (cancelledOrder && (cancelledOrder.gpUsed ?? 0) > 0) {
                  await awardGreenPoints({
                    userId: cancelledOrder.buyerId.toString(),
                    amount: cancelledOrder.gpUsed ?? 0,
                    type: "REFUND",
                    description: "Green Points returned after payment expiration",
                    referenceKey: `order:${cancelledOrder._id.toString()}:gp-refund`,
                    session,
                  });
                }
              }
            });
          } finally {
            await session.endSession();
          }
          payments = await Payment.find(query).sort({ createdAt: -1 }).lean();
        }
      } catch (error) {
        console.error("Could not synchronize Xendit payment status.", error);
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
