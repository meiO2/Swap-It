import mongoose from "mongoose";
import Payment, { type IPayment } from "@/models/Payment";
import { finalizePaidOrder, PaymentFinalizationConflict } from "@/lib/payment-finalization";

type VerifiedPayment = Pick<
  IPayment,
  | "orderId"
  | "userId"
  | "prasmulOrderId"
  | "prasmulQrId"
  | "prasmulBasicPrice"
  | "prasmulAmount"
  | "grossAmount"
  | "paymentType"
> & { _id: mongoose.Types.ObjectId };

export async function finalizePrasmulPayment(payment: VerifiedPayment) {
  const match = {
    _id: payment._id,
    provider: "PRASMUL" as const,
    orderId: payment.orderId,
    userId: payment.userId,
    prasmulOrderId: payment.prasmulOrderId,
    grossAmount: payment.grossAmount,
    prasmulAmount: payment.prasmulAmount ?? { $exists: false },
    prasmulQrId: payment.prasmulQrId ?? { $exists: false },
    prasmulBasicPrice: payment.prasmulBasicPrice ?? { $exists: false },
    paymentType: payment.paymentType ?? { $exists: false },
  };
  let alreadyProcessed = false;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      alreadyProcessed = false;
      const updated = await Payment.findOneAndUpdate(
        { ...match, status: "PENDING" },
        { $set: { status: "PAID", paidAt: new Date(), prasmulAmount: payment.grossAmount } },
        { new: true, session },
      ).lean();

      if (!updated) {
        const paid = await Payment.findOne({
          ...match,
          prasmulAmount: payment.grossAmount,
          status: "PAID",
        }).session(session).lean();
        if (!paid) throw new PaymentFinalizationConflict("Payment is not eligible for finalization.");
        alreadyProcessed = true;
        return;
      }

      await finalizePaidOrder(updated.orderId, session, {
        buyerId: updated.userId,
        amount: updated.grossAmount,
      });
    });
  } finally {
    await session.endSession();
  }
  return { alreadyProcessed };
}
