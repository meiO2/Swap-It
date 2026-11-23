import { NextRequest, NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import mongoose from "mongoose";
import { requireAuth } from "@/lib/authorization";
import { connectDB } from "@/lib/mongodb";
import { isMongoTransactionsUnsupported } from "@/lib/mongodb-transactions";
import {
  createPrasmulQrOrder,
  assertPrasmulConfigured,
  calculatePrasmulBasicPrice,
  getPrasmulOrderDetail,
  getPrasmulOrderReference,
  getPrasmulQrString,
  hasUniquePaymentOrderIndex,
  parsePrasmulExpiry,
  PrasmulAmountError,
  PrasmulApiError,
  PrasmulExpiryError,
  PrasmulQrError,
  type PrasmulCreatedOrder,
  type PrasmulOrder,
} from "@/lib/prasmul";
import Order from "@/models/Order";
import Payment from "@/models/Payment";
import { getPaymentProvider } from "@/lib/payment-provider";
import { verifyPrasmulStatus } from "@/lib/prasmul-status";

class PrasmulOrderCreationConflict extends Error {}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
}

function isReusableQr(
  payment: {
    status: string;
    grossAmount: number;
    prasmulAmount?: number;
    prasmulPaymentCode?: string;
    prasmulExpiredPayment?: Date;
    paymentData?: Record<string, unknown>;
  },
  targetAmount: number,
): boolean {
  const providerStatus = String(payment.paymentData?.prasmulStatus ?? "")
    .trim()
    .toLowerCase();

  return (
    payment.status === "PENDING" &&
    payment.grossAmount === targetAmount &&
    payment.prasmulAmount === targetAmount &&
    Boolean(payment.prasmulPaymentCode) &&
    Boolean(payment.prasmulExpiredPayment) &&
    new Date(payment.prasmulExpiredPayment!).getTime() > Date.now() &&
    providerStatus === "belum lunas"
  );
}

async function saveRemoteOrder(
  paymentId: mongoose.Types.ObjectId,
  remoteOrder: PrasmulOrder,
  expiry: Date | undefined,
  qrString: string | undefined,
) {
  const updated = await Payment.updateOne(
    { _id: paymentId, provider: "PRASMUL", status: "PENDING" },
    {
      $set: {
        prasmulOrderId: remoteOrder.order_id,
        prasmulQrId: remoteOrder.qr_id,
        ...(qrString ? { prasmulPaymentCode: qrString } : {}),
        ...(expiry ? { prasmulExpiredPayment: expiry } : {}),

        prasmulBasicPrice: remoteOrder.basic_price,
        prasmulAmount: remoteOrder.amount,
        prasmulAdminFee: remoteOrder.admin_fee,
        prasmulPpnAdminFee: remoteOrder.ppn_admin_fee,
        prasmulProcessingFee: remoteOrder.processing_fee,
        prasmulPpnProcessingFee: remoteOrder.ppn_processing_fee,
        prasmulPlatformFee: remoteOrder.platform_fee,

        paymentType: "QRIS",
        "paymentData.prasmulPartnerCode": "PRASMUL",
        ...(remoteOrder.partner_order_id !== undefined
          ? { "paymentData.prasmulPartnerOrderId": remoteOrder.partner_order_id }
          : {}),
        "paymentData.prasmulStatus": remoteOrder.status,
        "paymentData.prasmulExpiredPaymentRaw": remoteOrder.expired_payment,
        "paymentData.prasmulDescription": remoteOrder.description,
        "paymentData.prasmulSettleDate": remoteOrder.settle_date,
      },
    },
  );

  if (updated.matchedCount !== 1) return null;
  return Payment.findById(paymentId).lean();
}

function isNotFound(error: unknown): boolean {
  return error instanceof PrasmulApiError && error.status === 404;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.success) return auth.response;

    if (getPaymentProvider() !== "PRASMUL") {
      return NextResponse.json(
        { success: false, message: "PRASMUL is not the active payment provider." },
        { status: 409 },
      );
    }
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

    const newReference = getPrasmulOrderReference(order._id.toString());
    const legacyReference = `swapit-${order._id.toString()}`;

    let payment = await Payment.findOne({
      orderId: order._id,
    }).lean();

    let createdLocally = false;
    let webhookUrl: string | undefined;

    // Buat catatan lokal terlebih dahulu.
    // Hanya request yang berhasil membuat catatan ini yang boleh
    // melanjutkan ke POST create PRASMUL.
    if (!payment) {
      try {
        assertPrasmulConfigured();
      } catch {
        return NextResponse.json(
          { success: false, message: "PRASMUL credentials or base URL are not configured." },
          { status: 503 },
        );
      }
      try {
        calculatePrasmulBasicPrice(order.totalAmount);
      } catch (error) {
        if (!(error instanceof PrasmulAmountError)) throw error;
        return NextResponse.json(
          { success: false, message: "PRASMUL cannot produce an exact QRIS amount for this checkout." },
          { status: 409 },
        );
      }
      webhookUrl = process.env.PRASMUL_WEBHOOK_URL;
      if (!webhookUrl || !URL.canParse(webhookUrl)) {
        return NextResponse.json(
          { success: false, message: "PRASMUL webhook URL is not configured or invalid." },
          { status: 503 },
        );
      }
      const webhook = new URL(webhookUrl);
      if (
        webhook.protocol !== "https:" ||
        webhook.username ||
        webhook.password ||
        webhook.pathname !== "/api/payments/prasmul/callback/qris" ||
        webhook.search ||
        webhook.hash
      ) {
        return NextResponse.json(
          { success: false, message: "PRASMUL webhook URL is invalid." },
          { status: 503 },
        );
      }
      const isProduction = process.env.VERCEL_ENV
        ? process.env.VERCEL_ENV === "production"
        : process.env.NODE_ENV === "production";
      if (
        isProduction &&
        webhook.href !== "https://swapitproject.web.id/api/payments/prasmul/callback/qris"
      ) {
        return NextResponse.json(
          { success: false, message: "PRASMUL production webhook URL is invalid." },
          { status: 503 },
        );
      }
      const indexes = await Payment.collection.indexes();
      if (!hasUniquePaymentOrderIndex(indexes)) {
        return NextResponse.json(
          { success: false, message: "A unique payment order index is required before creating PRASMUL payments." },
          { status: 503 },
        );
      }
      const timeZone = process.env.PRASMUL_TIME_ZONE?.trim();
      if (!timeZone) {
        return NextResponse.json(
          { success: false, message: "PRASMUL expiry time zone must be confirmed and configured before creation." },
          { status: 503 },
        );
      }
      try {
        new Intl.DateTimeFormat("en-US", { timeZone });
      } catch (error) {
        if (!(error instanceof RangeError)) throw error;
        return NextResponse.json(
          { success: false, message: "PRASMUL expiry time zone is invalid." },
          { status: 503 },
        );
      }
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          const reservedOrder = await Order.updateOne(
            {
              _id: order._id,
              buyerId: order.buyerId,
              status: "PENDING_PAYMENT",
              totalAmount: order.totalAmount,
              expiresAt: { $gt: new Date() },
            },
            { $inc: { __v: 1 } },
            { session },
          );
          if (reservedOrder.matchedCount !== 1) {
            throw new PrasmulOrderCreationConflict("Order is no longer available for payment.");
          }

          const [createdPayment] = await Payment.create([{
            orderId: order._id,
            userId: order.buyerId,
            provider: "PRASMUL",
            midtransOrderId: `prasmul-${order._id.toString()}`,
            prasmulOrderId: newReference,
            grossAmount: order.totalAmount,
            paymentType: "QRIS",
            status: "PENDING",
            paymentData: {
              prasmulPartnerCode: "PRASMUL",
              prasmulStatus: "CREATING",
            },
          }], { session });

          payment = createdPayment.toObject();
        });
        createdLocally = true;
      } catch (error) {
        if (error instanceof PrasmulOrderCreationConflict) {
          return NextResponse.json(
            { success: false, message: error.message },
            { status: 409 },
          );
        }
        if (!isDuplicateKeyError(error)) {
          throw error;
        }

        payment = await Payment.findOne({
          orderId: order._id,
        }).lean();
      } finally {
        await session.endSession();
      }
    }

    if (!payment) {
      return NextResponse.json(
        {
          success: false,
          message: "Could not initialize the local payment record.",
        },
        { status: 500 },
      );
    }

    // Jangan pernah menimpa pembayaran dari provider lain.
    if (payment.provider !== "PRASMUL") {
      return NextResponse.json(
        {
          success: false,
          message: "This order already has a payment from another provider.",
        },
        { status: 409 },
      );
    }
    if (payment.status !== "PENDING") {
      return NextResponse.json(
        { success: false, message: "This order already has a final payment status." },
        { status: 409 },
      );
    }

    // Pastikan referensi lokal konsisten.
    if (!payment.prasmulOrderId) {
      return NextResponse.json(
        { success: false, message: "The stored PRASMUL reference is missing; manual reconciliation is required." },
        { status: 409 },
      );
    }
    if (
      payment.prasmulOrderId.toLowerCase() !== newReference.toLowerCase() &&
      payment.prasmulOrderId.toLowerCase() !== legacyReference.toLowerCase()
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Local PRASMUL reference does not match this order.",
        },
        { status: 409 },
      );
    }
    const prasmulOrderId = payment.prasmulOrderId;

    // QRIS yang sudah tersimpan hanya boleh digunakan kembali
    // jika nominal, status, dan masa berlakunya sesuai.
    let remoteOrder: PrasmulOrder | null = null;

    // Selalu cek referensi provider sebelum membuat transaksi.
    try {
      remoteOrder = await getPrasmulOrderDetail(prasmulOrderId);
    } catch (error) {
      if (!isNotFound(error)) {
        console.error("PRASMUL detail lookup failed.");

        return NextResponse.json(
          {
            success: false,
            message:
              "Could not verify the existing PRASMUL order. Please try again later.",
            reference: prasmulOrderId,
          },
          { status: 502 },
        );
      }

      // Hanya catatan lokal yang baru dibuat oleh request ini
      // yang boleh melanjutkan ke POST create setelah hasil GET 404.
      if (!createdLocally) {
        return NextResponse.json(
          {
            success: false,
            message:
              "The local PRASMUL payment exists, but the provider order was not found. Automatic recreation is disabled to prevent duplicate payments. Please contact support.",
            reference: prasmulOrderId,
          },
          { status: 409 },
        );
      }
    }

    // Jika provider sudah memiliki order, simpan detailnya.
    if (remoteOrder) {
      if (
        typeof remoteOrder.order_id !== "string" ||
        remoteOrder.order_id.toLowerCase() !== prasmulOrderId.toLowerCase()
      ) {
        return NextResponse.json(
          {
            success: false,
            message: "PRASMUL returned a different order reference.",
          },
          { status: 409 },
        );
      }
      if (payment.prasmulQrId && remoteOrder.qr_id !== payment.prasmulQrId) {
        return NextResponse.json(
          { success: false, message: "PRASMUL QR identity does not match the stored payment." },
          { status: 409 },
        );
      }
    } else {
      // Belum ditemukan di provider dan catatan lokal baru dibuat.
      if (!webhookUrl) {
        return NextResponse.json(
          { success: false, message: "PRASMUL webhook URL is not configured." },
          { status: 503 },
        );
      }

      let createdOrder: PrasmulCreatedOrder | undefined;
      try {
        const result = await createPrasmulQrOrder({
          orderId: prasmulOrderId,
          targetAmount: order.totalAmount,
          description: `SwapIt Order ${order._id.toString()}`,
          webhookUrl,
        });

        createdOrder = result.order;
      } catch {
        // POST bisa berhasil di provider meskipun respons tidak sampai.
        // Karena itu, lakukan GET dengan referensi yang sama.
        try {
          remoteOrder = await getPrasmulOrderDetail(prasmulOrderId);
        } catch {
          console.error("PRASMUL create/recovery failed.");

          return NextResponse.json(
            {
              success: false,
              message:
                "PRASMUL order creation could not be confirmed. Do not retry with a new reference. Please contact support.",
              reference: prasmulOrderId,
            },
            { status: 502 },
          );
        }
      }

      if (createdOrder) {
        const recorded = await Payment.updateOne(
          { _id: payment._id, provider: "PRASMUL", prasmulOrderId, status: "PENDING" },
          {
            $set: {
              "paymentData.prasmulCreateResponse": {
                orderId: createdOrder.order_id,
                partnerOrderId: createdOrder.partner_order_id,
                qrId: createdOrder.qr_id,
                basicPrice: createdOrder.basic_price,
                amount: createdOrder.amount,
                status: createdOrder.status,
                expiredPayment: createdOrder.expired_payment,
              },
              prasmulQrId: createdOrder.qr_id,
              prasmulBasicPrice: createdOrder.basic_price,
              prasmulAmount: createdOrder.amount,
              ...(createdOrder.amount === order.totalAmount
                ? { prasmulPaymentCode: getPrasmulQrString(createdOrder) }
                : {}),
            },
          },
        );
        if (recorded.matchedCount !== 1) {
          return NextResponse.json(
            { success: false, message: "PRASMUL creation could not be recorded. Manual reconciliation is required.", reference: prasmulOrderId },
            { status: 500 },
          );
        }
        if (createdOrder.amount !== order.totalAmount) {
          return NextResponse.json(
            { success: false, message: "PRASMUL QRIS amount does not match the SwapIt checkout total. The transaction has been saved for manual reconciliation.", reference: prasmulOrderId },
            { status: 409 },
          );
        }
        try {
          remoteOrder = await getPrasmulOrderDetail(prasmulOrderId);
        } catch (error) {
          console.error("PRASMUL detail lookup failed.", {
            errorName: error instanceof Error ? error.name : "UnknownError",
            errorMessage:
              error instanceof Error ? error.message : String(error),
            providerStatus:
              error instanceof PrasmulApiError ? error.status : undefined,
            reference: prasmulOrderId,
          });
          return NextResponse.json(
            { success: false, message: "PRASMUL creation was recorded, but its detail could not be verified. Please contact support.", reference: prasmulOrderId },
            { status: 502 },
          );
        }
        if (
          typeof remoteOrder.order_id !== "string" ||
          remoteOrder.order_id.toLowerCase() !== createdOrder.order_id.toLowerCase() ||
          remoteOrder.qr_id !== createdOrder.qr_id ||
          remoteOrder.basic_price !== createdOrder.basic_price ||
          remoteOrder.amount !== createdOrder.amount
        ) {
          return NextResponse.json(
            { success: false, message: "PRASMUL creation and order detail do not match. Manual reconciliation is required.", reference: prasmulOrderId },
            { status: 409 },
          );
        }
      }

      if (!remoteOrder) {
        return NextResponse.json(
          {
            success: false,
            message: "PRASMUL order could not be retrieved.",
            reference: prasmulOrderId,
          },
          { status: 502 },
        );
      }
    }

    if (
      typeof remoteOrder.order_id !== "string" ||
      remoteOrder.order_id.toLowerCase() !== prasmulOrderId.toLowerCase() ||
      typeof remoteOrder.payment_method !== "string" ||
      remoteOrder.payment_method.toUpperCase() !== "QRIS"
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "PRASMUL order reference or payment method is invalid.",
        },
        { status: 409 },
      );
    }

    // Simpan detail provider SEBELUM memeriksa kecocokan nominal.
    // Dengan demikian, transaksi provider tidak hilang dari catatan lokal.
    let expiredAt: Date | undefined;
    try {
      expiredAt = parsePrasmulExpiry(remoteOrder.expired_payment, process.env.PRASMUL_TIME_ZONE);
    } catch (error) {
      if (!(error instanceof PrasmulExpiryError)) throw error;
    }
    let qrString: string | undefined;
    try {
      qrString = getPrasmulQrString(remoteOrder);
    } catch (error) {
      if (!(error instanceof PrasmulQrError)) throw error;
      console.error("PRASMUL returned an invalid QR value.", prasmulOrderId);
    }
    const savedPayment = await saveRemoteOrder(payment._id, remoteOrder, expiredAt, qrString);

    if (!savedPayment) {
      return NextResponse.json(
        {
          success: false,
          message:
            "PRASMUL order was found, but local payment synchronization failed. Please contact support.",
          reference: prasmulOrderId,
        },
        { status: 500 },
      );
    }

    // Jangan berikan QR kepada pembeli jika nominal tidak cocok.
    if (
      remoteOrder.amount !== order.totalAmount ||
      savedPayment.grossAmount !== order.totalAmount
    ) {
      console.error("PRASMUL amount mismatch:", {
        orderId: prasmulOrderId,
        targetAmount: order.totalAmount,
        providerAmount: remoteOrder.amount,
        basicPrice: remoteOrder.basic_price,
      });

      return NextResponse.json(
        {
          success: false,
          message:
            "PRASMUL QRIS amount does not match the SwapIt checkout total. The transaction has been saved for manual reconciliation.",
          reference: prasmulOrderId,
          targetAmount: order.totalAmount,
          providerAmount: remoteOrder.amount,
        },
        { status: 409 },
      );
    }

    const providerStatus = remoteOrder.status.trim().toLowerCase();
    if (
      !qrString ||
      !remoteOrder.qr_id ||
      !expiredAt ||
      expiredAt.getTime() <= Date.now() ||
      providerStatus !== "belum lunas"
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "The PRASMUL order was saved, but its QRIS or expiry could not be verified. Please contact support.",
          reference: prasmulOrderId,
          providerStatus: remoteOrder.status,
        },
        { status: 409 },
      );
    }

    if (
      verifyPrasmulStatus(savedPayment, remoteOrder) !== "PENDING" ||
      !isReusableQr(savedPayment, order.totalAmount)
    ) {
      return NextResponse.json(
        { success: false, message: "The PRASMUL payment is not available for display." },
        { status: 409 },
      );
    }
    const availableOrder = await Order.findOne({
      _id: order._id,
      buyerId: auth.user.id,
      status: "PENDING_PAYMENT",
      totalAmount: savedPayment.grossAmount,
      expiresAt: { $gt: new Date() },
    }).select("expiresAt").lean();
    if (!availableOrder) {
      return NextResponse.json(
        { success: false, message: "The PRASMUL payment is not available for display." },
        { status: 409 },
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        paymentId: savedPayment._id,
        orderId: savedPayment.orderId,
        provider: "PRASMUL",
        status: savedPayment.status,
        qrString: savedPayment.prasmulPaymentCode,
        grossAmount: savedPayment.grossAmount,
        providerAmount: savedPayment.prasmulAmount,
        expiredPayment: new Date(Math.min(expiredAt.getTime(), availableOrder.expiresAt.getTime())),
      },
    });
  } catch (error) {
    unstable_rethrow(error);
    if (isMongoTransactionsUnsupported(error)) {
      console.error("PRASMUL payment creation requires a MongoDB replica set or sharded cluster.");
      return NextResponse.json(
        { success: false, message: "MongoDB transactions are unavailable; PRASMUL payment creation cannot proceed." },
        { status: 503 },
      );
    }
    console.error("Create PRASMUL payment failed.");

    return NextResponse.json(
      {
        success: false,
        message: "Failed to create PRASMUL payment.",
      },
      { status: 500 },
    );
  }
}
