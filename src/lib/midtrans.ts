import crypto from "crypto";

type SnapTransactionResponse = {
  token: string;
  redirect_url: string;
};

export type CorePaymentMethod =
  | "bca_va"
  | "bni_va"
  | "bri_va"
  | "mandiri_va"
  | "permata_va"
  | "qris"
  | "gopay"
  | "shopeepay"
  | "indomaret"
  | "alfamart"
  | "credit_card";

type CoreChargeResponse = {
  status_code: string;
  status_message: string;
  transaction_id?: string;
  transaction_status?: string;
  payment_type?: string;
  va_numbers?: Array<{ bank: string; va_number: string }>;
  permata_va_number?: string;
  bill_key?: string;
  biller_code?: string;
  actions?: Array<{ name: string; method: string; url: string }>;
};

type MidtransConfig = {
  serverKey: string;
  baseUrl: string;
  apiBaseUrl: string;
};

function getConfig(): MidtransConfig {
  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  if (!serverKey) {
    throw new Error("MIDTRANS_SERVER_KEY is not configured.");
  }

  return {
    serverKey,
    baseUrl:
      process.env.MIDTRANS_IS_PRODUCTION === "true"
        ? "https://app.midtrans.com"
        : "https://app.sandbox.midtrans.com",
    apiBaseUrl:
      process.env.MIDTRANS_IS_PRODUCTION === "true"
        ? "https://api.midtrans.com"
        : "https://api.sandbox.midtrans.com",
  };
}

export async function getMidtransTransactionStatus(orderId: string) {
  const config = getConfig();
  const authorization = Buffer.from(`${config.serverKey}:`).toString("base64");
  const response = await fetch(
    `${config.apiBaseUrl}/v2/${encodeURIComponent(orderId)}/status`,
    {
      headers: {
        Accept: "application/json",
        Authorization: `Basic ${authorization}`,
      },
      cache: "no-store",
    },
  );
  const payload = (await response.json().catch(() => null)) as
    | {
        transaction_status?: string;
        fraud_status?: string;
        transaction_id?: string;
        payment_type?: string;
      }
    | { status_message?: string }
    | null;
  if (!response.ok || !payload || !("transaction_status" in payload)) {
    throw new Error(
      payload && "status_message" in payload
        ? payload.status_message ?? "Midtrans status request failed."
        : "Midtrans status request failed.",
    );
  }
  return payload;
}

export async function createSnapTransaction(input: {
  orderId: string;
  grossAmount: number;
  itemDetails: Array<{
    id: string;
    price: number;
    quantity: number;
    name: string;
  }>;
  customer: {
    firstName: string;
    email: string;
  };
  finishUrl?: string;
}) {
  const config = getConfig();
  const authorization = Buffer.from(`${config.serverKey}:`).toString("base64");
  const response = await fetch(`${config.baseUrl}/snap/v1/transactions`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${authorization}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      transaction_details: {
        order_id: input.orderId,
        gross_amount: input.grossAmount,
      },
      item_details: input.itemDetails,
      customer_details: input.customer,
      ...(input.finishUrl
        ? { callbacks: { finish: input.finishUrl } }
        : {}),
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | SnapTransactionResponse
    | { error_messages?: string[] }
    | null;
  if (!response.ok || !payload || !("token" in payload)) {
    const message =
      payload && "error_messages" in payload
        ? payload.error_messages?.join(", ")
        : undefined;
    throw new Error(
      `Midtrans transaction creation failed${message ? `: ${message}` : "."}`,
    );
  }

  return payload;
}

export async function chargeCoreTransaction(input: {
  orderId: string;
  grossAmount: number;
  paymentMethod: CorePaymentMethod;
  customer: { firstName: string; email: string };
  itemDetails: Array<{ id: string; price: number; quantity: number; name: string }>;
  tokenId?: string;
}) {
  const config = getConfig();
  const authorization = Buffer.from(`${config.serverKey}:`).toString("base64");
  const paymentType =
    input.paymentMethod.endsWith("_va") ? "bank_transfer" :
    input.paymentMethod === "qris" ? "gopay" :
    input.paymentMethod === "credit_card" ? "credit_card" :
    input.paymentMethod === "gopay" ? "gopay" :
    input.paymentMethod === "shopeepay" ? "shopeepay" : "cstore";
  const bank = input.paymentMethod.replace("_va", "");
  const body: Record<string, unknown> = {
    payment_type: paymentType,
    transaction_details: { order_id: input.orderId, gross_amount: input.grossAmount },
    customer_details: input.customer,
    item_details: input.itemDetails,
  };
  if (paymentType === "bank_transfer") {
    body.bank_transfer = { bank };
  } else if (paymentType === "gopay") {
    body.gopay = { enable_callback: true };
  } else if (paymentType === "shopeepay") {
    body.shopeepay = { callback_url: `${config.baseUrl}/snap/v1/transactions` };
  } else if (paymentType === "cstore") {
    body.cstore = { store: input.paymentMethod, message: "SwapIt payment" };
  } else if (paymentType === "credit_card") {
    if (!input.tokenId) throw new Error("A Midtrans card token is required.");
    body.credit_card = { token_id: input.tokenId, authentication: true };
  }
  const response = await fetch(`${config.apiBaseUrl}/v2/charge`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${authorization}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as
    | CoreChargeResponse
    | { error_messages?: string[] }
    | null;
  if (!response.ok || !payload || !("status_code" in payload) || !payload.status_code.startsWith("2")) {
    const message = payload && "error_messages" in payload ? payload.error_messages?.join(", ") : undefined;
    throw new Error(`Midtrans payment charge failed${message ? `: ${message}` : "."}`);
  }
  return payload;
}

export function verifyMidtransSignature(input: {
  orderId: string;
  statusCode: string;
  grossAmount: string;
  signatureKey: string;
}) {
  const expected = crypto
    .createHash("sha512")
    .update(
      `${input.orderId}${input.statusCode}${input.grossAmount}${getConfig().serverKey}`,
    )
    .digest("hex");
  const actual = input.signatureKey.trim().toLowerCase();
  const expectedBuffer = Buffer.from(expected, "utf8");
  const actualBuffer = Buffer.from(actual, "utf8");

  return (
    expectedBuffer.length === actualBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, actualBuffer)
  );
}

export function getMidtransServerKeyConfigured() {
  return Boolean(process.env.MIDTRANS_SERVER_KEY);
}
