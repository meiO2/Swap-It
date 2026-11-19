import type { PaymentProvider } from "../models/Payment.ts";

export function parsePaymentProvider(value: string | undefined): PaymentProvider {
  const provider = (value ?? "XENDIT").trim().toUpperCase();
  if (provider !== "XENDIT" && provider !== "PRASMUL") {
    throw new Error("Invalid payment provider configuration.");
  }
  return provider;
}

export function getPaymentProvider(): PaymentProvider {
  return parsePaymentProvider(process.env.PAYMENT_PROVIDER);
}
