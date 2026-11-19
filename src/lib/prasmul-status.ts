import type { PrasmulOrder } from "./prasmul.ts";

// Enable only after authenticated provider confirmation and lifecycle handling are implemented.
export const PRASMUL_CONFIRMATION_VERIFIED = false;

type StoredPrasmulPayment = {
  prasmulOrderId?: string;
  prasmulQrId?: string;
  prasmulAmount?: number;
  prasmulBasicPrice?: number;
  grossAmount: number;
};

export function verifyPrasmulStatus(
  payment: StoredPrasmulPayment,
  order: PrasmulOrder,
): "PENDING" | "UNKNOWN" {
  if (
    !payment.prasmulOrderId ||
    order.order_id !== payment.prasmulOrderId ||
    typeof order.payment_method !== "string" ||
    order.payment_method.toUpperCase() !== "QRIS" ||
    !payment.prasmulQrId ||
    order.qr_id !== payment.prasmulQrId ||
    order.amount !== payment.grossAmount ||
    order.amount !== payment.prasmulAmount ||
    (payment.prasmulBasicPrice !== undefined &&
      order.basic_price !== payment.prasmulBasicPrice) ||
    typeof order.status !== "string"
  ) {
    throw new Error("PRASMUL payment details do not match the stored payment.");
  }
  return order.status.trim().toLowerCase() === "belum lunas"
    ? "PENDING"
    : "UNKNOWN";
}
