import crypto from "crypto";

type XenditConfig = {
  secretKey: string;
  authorization: string;
};

type XenditPaymentSession = {
  payment_session_id: string;
  reference_id: string;
  status: string;
  amount: number;
  payment_link_url: string;
  payment_request_id?: string | null;
  latest_payment_request_id?: string | null;
  payment_id?: string | null;
};

export type XenditQrCode = {
  id: string;
  external_id: string;
  amount: number;
  qr_string: string;
  status: "ACTIVE" | "INACTIVE";
};

function getSecretKey() {
  const secretKey = process.env.XENDIT_SECRET_KEY;
  if (!secretKey) throw new Error("XENDIT_SECRET_KEY is not configured.");
  return secretKey;
}

function getConfig(): XenditConfig {
  const secretKey = getSecretKey();
  return {
    secretKey,
    authorization: `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`,
  };
}

async function xenditRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const { authorization } = getConfig();
  const response = await fetch(`https://api.xendit.co${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: authorization,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as
    | (T & { message?: string; errors?: Array<{ message?: string }> })
    | null;

  if (!response.ok || !payload) {
    const message =
      payload?.errors?.map((error) => error.message).filter(Boolean).join(", ") ??
      payload?.message;
    throw new Error(`Xendit request failed${message ? `: ${message}` : "."}`);
  }
  return payload;
}

export async function createXenditPaymentSession(input: {
  referenceId: string;
  amount: number;
  email: string;
  name: string;
  successReturnUrl: string;
  cancelReturnUrl: string;
}) {
  const givenNames = input.name.trim() || "SwapIt customer";
  return xenditRequest<XenditPaymentSession>("/sessions", {
    method: "POST",
    body: JSON.stringify({
      reference_id: input.referenceId,
      session_type: "PAY",
      mode: "PAYMENT_LINK",
      amount: input.amount,
      currency: "IDR",
      country: "ID",
      allowed_payment_channels: ["QRIS"],
      customer: {
        reference_id: input.referenceId,
        type: "INDIVIDUAL",
        email: input.email,
        individual_detail: { given_names: givenNames },
      },
      success_return_url: input.successReturnUrl,
      cancel_return_url: input.cancelReturnUrl,
    }),
  });
}

export function getXenditPaymentSession(sessionId: string) {
  return xenditRequest<XenditPaymentSession>(
    `/sessions/${encodeURIComponent(sessionId)}`,
  );
}

export async function createXenditQrCode(input: {
  externalId: string;
  amount: number;
  callbackUrl: string;
}) {
  if (!Number.isSafeInteger(input.amount) || input.amount < 1500 || input.amount > 10_000_000) {
    throw new Error("QRIS payments must be between Rp1.500 and Rp10.000.000.");
  }

  const body = new URLSearchParams({
    external_id: input.externalId,
    type: "DYNAMIC",
    callback_url: input.callbackUrl,
    amount: String(input.amount),
  });
  return xenditRequest<XenditQrCode>("/qr_codes", {
    method: "POST",
    body,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
}

export function getXenditQrCode(externalId: string) {
  return xenditRequest<XenditQrCode>(
    `/qr_codes/${encodeURIComponent(externalId)}`,
  );
}

export async function refundXenditPayment(input: {
  paymentRequestId?: string;
  qrPaymentId?: string;
  referenceId: string;
  amount: number;
}) {
  if (input.qrPaymentId) {
    return xenditRequest<{ id?: string; status?: string }>(
      `/qr_codes/payments/${encodeURIComponent(input.qrPaymentId)}/refunds`,
      {
        method: "POST",
        body: JSON.stringify({
          amount: input.amount,
          reason: "REQUESTED_BY_CUSTOMER",
        }),
      },
    );
  }
  if (!input.paymentRequestId) {
    throw new Error("Xendit payment reference is missing.");
  }
  return xenditRequest<{ id?: string; status?: string }>("/refunds", {
    method: "POST",
    body: JSON.stringify({
      reference_id: input.referenceId,
      payment_request_id: input.paymentRequestId,
      currency: "IDR",
      amount: input.amount,
      reason: "REQUESTED_BY_CUSTOMER",
    }),
  });
}

export function getXenditCallbackTokenConfigured() {
  return Boolean(process.env.XENDIT_CALLBACK_TOKEN);
}

export function verifyXenditCallbackToken(receivedToken: string | null) {
  const callbackToken = process.env.XENDIT_CALLBACK_TOKEN;
  if (!callbackToken || !receivedToken) return false;
  const expectedBuffer = Buffer.from(callbackToken, "utf8");
  const receivedBuffer = Buffer.from(receivedToken, "utf8");
  return (
    expectedBuffer.length === receivedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}

export function getXenditServerKeyConfigured() {
  return Boolean(process.env.XENDIT_SECRET_KEY);
}
