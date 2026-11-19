import { NextRequest, NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import mongoose from "mongoose";
import { requireAuth } from "@/lib/authorization";
import { connectDB } from "@/lib/mongodb";
import { getPrasmulOrderDetail, PrasmulApiError } from "@/lib/prasmul";
import Payment from "@/models/Payment";
import { verifyPrasmulStatus } from "@/lib/prasmul-status";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.success) return auth.response;

    await connectDB();

    const orderId = new URL(request.url).searchParams.get("orderId");

    if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
      return NextResponse.json(
        {
          success: false,
          message: "A valid orderId is required.",
        },
        { status: 400 },
      );
    }

    const payment = await Payment.findOne({
      orderId,
      userId: auth.user.id,
      provider: "PRASMUL",
    }).lean();

    if (!payment) {
      return NextResponse.json(
        {
          success: false,
          message: "PRASMUL payment not found.",
        },
        { status: 404 },
      );
    }

    if (!payment.prasmulOrderId) {
      return NextResponse.json(
        {
          success: false,
          message: "PRASMUL order reference is missing.",
        },
        { status: 409 },
      );
    }

    let remoteOrder;

    try {
      remoteOrder = await getPrasmulOrderDetail(payment.prasmulOrderId);
    } catch (error) {
      if (error instanceof PrasmulApiError && error.status === 404) {
        return NextResponse.json(
          {
            success: false,
            message:
              "The local payment exists, but its PRASMUL order was not found. Manual reconciliation is required.",
            reference: payment.prasmulOrderId,
          },
          { status: 409 },
        );
      }

      console.error("PRASMUL detail lookup failed.");

      return NextResponse.json(
        {
          success: false,
          message: "Could not retrieve payment status from PRASMUL.",
        },
        { status: 502 },
      );
    }

    const mappedStatus = verifyPrasmulStatus(payment, remoteOrder);

    // Endpoint ini hanya membaca status.
    // Tidak mengubah Payment atau Order menjadi PAID.
    return NextResponse.json({
      success: true,
      data: {
        paymentId: payment._id,
        orderId: payment.orderId,
        provider: "PRASMUL",

        localStatus: payment.status,
        providerStatus: remoteOrder.status,
        mappedStatus,

        basicPrice: remoteOrder.basic_price,
        providerAmount: remoteOrder.amount,

        expiredPayment: remoteOrder.expired_payment,
        settleDate: remoteOrder.settle_date,
        paymentMethod: remoteOrder.payment_method,

        verifiedReference: true,
        verifiedAmount: true,
        verifiedPaymentMethod: true,
        verifiedQrId: Boolean(payment.prasmulQrId),
      },
    });
  } catch (error) {
    unstable_rethrow(error);
    console.error("PRASMUL payment status check failed.");

    return NextResponse.json(
      {
        success: false,
        message: "Failed to verify PRASMUL payment status.",
      },
      { status: 500 },
    );
  }
}
