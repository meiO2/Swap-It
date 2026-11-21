import type { PrasmulOrder } from "./prasmul.ts";

type StoredPrasmulPayment = {
  prasmulOrderId?: string;
  prasmulQrId?: string;
  prasmulAmount?: number;
  prasmulBasicPrice?: number;
  grossAmount: number;
  paymentType?: string;
};

export class PrasmulStatusMismatchError extends Error {}

export function mapPrasmulStatus(status: string): "PENDING" | "PAID" | "UNKNOWN" {
  const normalized = status.trim().toLowerCase();
  if (normalized === "belum lunas") return "PENDING";
  if (normalized === "lunas") return "PAID";
  return "UNKNOWN";
}

export function verifyPrasmulStatus(
  payment: StoredPrasmulPayment,
  order: PrasmulOrder,
): "PENDING" | "PAID" | "UNKNOWN" {
  return verifyPrasmulCallbackStatus(
    payment,
    order,
    payment.prasmulOrderId ?? "",
    payment.grossAmount,
  );
}

export function verifyPrasmulCallbackStatus(
  payment: StoredPrasmulPayment,
  order: PrasmulOrder,
  reference: string,
  amount: number,
): "PENDING" | "PAID" | "UNKNOWN" {
  if (
    !payment.prasmulOrderId ||
    payment.prasmulOrderId.toLowerCase() !== reference.toLowerCase() ||
    typeof order.order_id !== "string" ||
    order.order_id.toLowerCase() !== payment.prasmulOrderId.toLowerCase() ||
    typeof order.payment_method !== "string" ||
    order.payment_method.toUpperCase() !== "QRIS" ||
    (payment.paymentType !== undefined && payment.paymentType.toUpperCase() !== "QRIS") ||
    !Number.isSafeInteger(payment.grossAmount) ||
    payment.grossAmount <= 0 ||
    payment.grossAmount !== amount ||
    (payment.prasmulAmount !== undefined && payment.prasmulAmount !== payment.grossAmount) ||
    order.amount !== payment.grossAmount ||
    (order.qr_id !== undefined && typeof order.qr_id !== "string") ||
    (order.qr_id !== undefined && payment.prasmulQrId !== undefined &&
      order.qr_id !== payment.prasmulQrId) ||
    (order.basic_price !== undefined && payment.prasmulBasicPrice !== undefined &&
      order.basic_price !== payment.prasmulBasicPrice) ||
    typeof order.status !== "string"
  ) {
    throw new PrasmulStatusMismatchError("PRASMUL payment details do not match the stored payment.");
  }
  return mapPrasmulStatus(order.status);
}
