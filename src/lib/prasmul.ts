import type { IndexDescriptionInfo } from "mongodb";

type PrasmulLoginResponse = {
  token?: string;
  access?: string;
  access_token?: string;
};

let cachedToken: string | null = null;
let tokenRequest: Promise<string> | null = null;

function isDigitalCity(baseUrl: string): boolean {
  const url = new URL(baseUrl);
  return url.protocol === "https:" && url.hostname === "digitalcity.id";
}

function getPrasmulConfig() {
  const baseUrl = process.env.PRASMUL_BASE_URL;
  const email = process.env.PRASMUL_EMAIL;
  const password = process.env.PRASMUL_PASSWORD;

  if (!baseUrl || !email || !password) {
    throw new Error("PRASMUL environment variables are incomplete.");
  }

  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    email,
    password,
  };
}

export function assertPrasmulConfigured(): void {
  const { baseUrl } = getPrasmulConfig();
  if (!URL.canParse(baseUrl)) {
    throw new Error("PRASMUL base URL is invalid.");
  }
  const url = new URL(baseUrl);
  if (
    (process.env.NODE_ENV === "production" && url.protocol !== "https:") ||
    url.username || url.password || url.search || url.hash
  ) {
    throw new Error("PRASMUL base URL is invalid.");
  }
}

export class PrasmulApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "PrasmulApiError";
    this.status = status;
  }
}

export async function getPrasmulToken(): Promise<string> {
  if (cachedToken) {
    return cachedToken;
  }

  if (!tokenRequest) {
    tokenRequest = (async () => {
      const { baseUrl, email, password } = getPrasmulConfig();
      const loginPath = isDigitalCity(baseUrl)
        ? "/api/partner/auth/login"
        : "/api/partners/login/";
      const response = await fetch(`${baseUrl}${loginPath}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        throw new Error(`PRASMUL login failed with status ${response.status}.`);
      }

      const data = (await response.json()) as PrasmulLoginResponse;
      const token = data.token ?? data.access ?? data.access_token;
      if (!token || typeof token !== "string") {
        throw new Error("PRASMUL login response does not contain a token.");
      }
      cachedToken = token;
      return token;
    })();
  }

  const pending = tokenRequest;
  try {
    return await pending;
  } finally {
    if (tokenRequest === pending) tokenRequest = null;
  }
}


export type PrasmulOrder = {
  id: number;
  order_id: string;
  partner_order_id: string;
  basic_price: number;
  amount: number;
  admin_fee: number;
  ppn_admin_fee: number;
  processing_fee: number;
  ppn_processing_fee: number;
  platform_fee: number;
  payment_method: string;
  payment_code?: string;
  qr_string?: string;
  qr_id?: string;
  status: string;
  expired_payment: string;
  settle_date: string | null;
  description: string;
};

export class PrasmulQrError extends Error {}

export function getPrasmulQrString(order: {
  qr_string?: string;
  payment_code?: string;
}): string | undefined {
  const qrString = order.qr_string;
  const legacyCode = order.payment_code;
  if (
    (qrString !== undefined && typeof qrString !== "string") ||
    (legacyCode !== undefined && typeof legacyCode !== "string")
  ) {
    throw new PrasmulQrError("PRASMUL returned an invalid QR value.");
  }
  if (qrString && legacyCode && qrString !== legacyCode) {
    throw new PrasmulQrError("PRASMUL returned conflicting QR values.");
  }
  return qrString || legacyCode;
}

export function getPrasmulOrderReference(orderId: string): string {
  return `PRASMUL-${orderId}`;
}

export function hasUniquePaymentOrderIndex(indexes: IndexDescriptionInfo[]): boolean {
  return indexes.some(
    (index) =>
      index.unique === true &&
      index.sparse !== true &&
      !index.partialFilterExpression &&
      Object.keys(index.key).length === 1 &&
      index.key.orderId === 1,
  );
}

export class PrasmulExpiryError extends Error {}

export function parsePrasmulExpiry(value: string, timeZone?: string): Date {
  if (typeof value !== "string") {
    throw new PrasmulExpiryError("Invalid PRASMUL expiry format.");
  }
  const provider = /^(\d{4})-(\d{2})-(\d{2}) \| (\d{2}):(\d{2}):(\d{2})$/.exec(value);
  const iso = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  const parts = provider ?? iso;
  if (!parts) throw new PrasmulExpiryError("Invalid PRASMUL expiry format.");

  const [year, month, day, hour, minute, second] = parts.slice(1, 7).map(Number);
  const milliseconds = iso?.[7] ? Number(iso[7].padEnd(3, "0")) : 0;
  const wallTime = Date.UTC(year, month - 1, day, hour, minute, second, milliseconds);
  const date = new Date(wallTime);
  if (
    year < 100 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute ||
    date.getUTCSeconds() !== second
  ) {
    throw new PrasmulExpiryError("Invalid PRASMUL expiry date.");
  }

  if (iso) {
    const zone = iso[8];
    if (zone === "Z") return date;
    const offsetHour = Number(zone.slice(1, 3));
    const offsetMinute = Number(zone.slice(4, 6));
    if (offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) {
      throw new PrasmulExpiryError("Invalid PRASMUL expiry offset.");
    }
    const direction = zone[0] === "+" ? 1 : -1;
    return new Date(wallTime - direction * (offsetHour * 60 + offsetMinute) * 60000);
  }

  if (!timeZone?.trim()) {
    throw new PrasmulExpiryError("PRASMUL expiry time zone is not configured.");
  }
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-US-u-nu-latn", {
      timeZone: timeZone.trim(),
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    throw new PrasmulExpiryError("Invalid PRASMUL expiry time zone.");
  }

  const localTime = (instant: number) => {
    const values: Record<string, number> = {};
    for (const part of formatter.formatToParts(instant)) {
      if (part.type !== "literal") values[part.type] = Number(part.value);
    }
    const localDate = new Date(Date.UTC(
      values.year, values.month - 1, values.day, values.hour, values.minute, values.second,
    ));
    if (values.year >= 0 && values.year < 100) localDate.setUTCFullYear(values.year);
    return localDate.getTime();
  };
  const offsets = new Set(
    [-48, -24, 0, 24, 48].map((hours) => {
      const sample = wallTime + hours * 3600000;
      return localTime(sample) - sample;
    }),
  );
  const matches = [...offsets]
    .map((offset) => wallTime - offset)
    .filter((instant) => localTime(instant) === wallTime);
  if (matches.length !== 1) {
    throw new PrasmulExpiryError("PRASMUL expiry is ambiguous or invalid in its time zone.");
  }
  return new Date(matches[0]);
}

async function prasmulGet<T>(path: string): Promise<T> {
  const { baseUrl } = getPrasmulConfig();
  let token = await getPrasmulToken();
  const fetchDetail = (accessToken: string) =>
    fetch(`${baseUrl}${path}`, {
      method: "GET",
      headers: {
        Authorization: `Token ${accessToken}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });

  let response = await fetchDetail(token);
  if (response.status === 401) {
    if (cachedToken === token) cachedToken = null;
    token = await getPrasmulToken();
    response = await fetchDetail(token);
  }

  if (!response.ok) {
    throw new PrasmulApiError(
      `PRASMUL request failed with status ${response.status}.`,
      response.status,
    );
  }

  return (await response.json()) as T;
}

export async function getPrasmulOrderDetail(
  orderId: string,
): Promise<PrasmulOrder> {
  return prasmulGet<PrasmulOrder>(
    `/api/partners/order/detail/${encodeURIComponent(orderId)}/`,
  );
}

export async function getPrasmulOrders(): Promise<PrasmulOrder[]> {
  const { baseUrl } = getPrasmulConfig();
  if (isDigitalCity(baseUrl)) {
    throw new Error("Digital City order listing endpoint is not verified.");
  }
  return prasmulGet<PrasmulOrder[]>("/api/partners/orders/");
}


export type PrasmulFeeEstimate = {
  basicPrice: number;
  adminFee: number;
  ppnAdminFee: number;
  processingFee: number;
  ppnProcessingFee: number;
  platformFee: number;
  totalProviderFees: number;
  estimatedAmount: number;
};

export class PrasmulAmountError extends Error {}

// Tarif berdasarkan response PRASMUL yang sudah kita uji.
const PRASMUL_ADMIN_FEE_RATE = 0.007;
const PRASMUL_PPN_RATE = 0.11;
const PRASMUL_PROCESSING_FEE = 4000;
const PRASMUL_PPN_PROCESSING_FEE = 400;
const PRASMUL_PLATFORM_FEE = 1500;

function estimatePrasmulAmount(basicPrice: number): PrasmulFeeEstimate {
  const adminFee = basicPrice * PRASMUL_ADMIN_FEE_RATE;
  const ppnAdminFee = adminFee * PRASMUL_PPN_RATE;

  const totalProviderFees =
    adminFee +
    ppnAdminFee +
    PRASMUL_PROCESSING_FEE +
    PRASMUL_PPN_PROCESSING_FEE +
    PRASMUL_PLATFORM_FEE;

  const estimatedAmount = Math.round(basicPrice + totalProviderFees);

  return {
    basicPrice,
    adminFee,
    ppnAdminFee,
    processingFee: PRASMUL_PROCESSING_FEE,
    ppnProcessingFee: PRASMUL_PPN_PROCESSING_FEE,
    platformFee: PRASMUL_PLATFORM_FEE,
    totalProviderFees,
    estimatedAmount,
  };
}

/**
 * Mencari basic_price agar estimasi amount PRASMUL
 * sama persis dengan total checkout SwapIt.
 *
 * Fungsi ini hanya melakukan kalkulasi lokal.
 * Tidak memanggil API PRASMUL.
 */
export function calculatePrasmulBasicPrice(
  targetAmount: number,
): PrasmulFeeEstimate {
  if (!Number.isSafeInteger(targetAmount) || targetAmount <= 0) {
    throw new PrasmulAmountError("Invalid PRASMUL target amount.");
  }

  let low = 1;
  let high = targetAmount;
  let match: PrasmulFeeEstimate | undefined;
  while (low <= high) {
    const basicPrice = low + Math.floor((high - low) / 2);
    const estimate = estimatePrasmulAmount(basicPrice);
    if (estimate.estimatedAmount === targetAmount) {
      match = estimate;
      low = basicPrice + 1;
    } else if (estimate.estimatedAmount < targetAmount) {
      low = basicPrice + 1;
    } else {
      high = basicPrice - 1;
    }
  }

  if (match) return match;
  throw new PrasmulAmountError(
    `No PRASMUL basic price found for target amount ${targetAmount}.`,
  );
}


export type PrasmulCreatedOrder = Pick<
  PrasmulOrder,
  "order_id" | "basic_price" | "amount" | "status" | "expired_payment"
> & {
  qr_id: string;
  partner_order_id?: string;
  payment_method?: string;
  payment_code?: string;
  qr_string?: string;
};

type PrasmulCreateOrderResponse = {
  status: string;
  message: string;
  data: PrasmulCreatedOrder;
};

export type CreatePrasmulQrInput = {
  orderId: string;
  targetAmount: number;
  description: string;
  webhookUrl: string;
};

export type CreatePrasmulQrResult = {
  order: PrasmulCreatedOrder;
  estimate: PrasmulFeeEstimate;
  amountMatchesTarget: boolean;
};

export async function createPrasmulQrOrder(
  input: CreatePrasmulQrInput,
): Promise<CreatePrasmulQrResult> {
  const { orderId, targetAmount, description, webhookUrl } = input;

  if (!orderId.trim()) {
    throw new Error("PRASMUL order ID is required.");
  }

  if (!description.trim() || !webhookUrl.trim()) {
    throw new Error("PRASMUL description and webhook URL are required.");
  }

  // Hitung basic_price berdasarkan total checkout SwapIt.
  const estimate = calculatePrasmulBasicPrice(targetAmount);

  const { baseUrl } = getPrasmulConfig();
  const token = await getPrasmulToken();

  const response = await fetch(`${baseUrl}/api/partners/orders/`, {
    method: "POST",
    headers: {
      Authorization: `Token ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      order_id: orderId,
      basic_price: estimate.basicPrice,
      payment_method: "QRIS",
      description,
      callback_url: webhookUrl,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new PrasmulApiError(
      `PRASMUL create order failed with status ${response.status}.`,
      response.status,
    );
  }

  const result = (await response.json()) as PrasmulCreateOrderResponse;

  if (result.status !== "success" || !result.data) {
    throw new Error(result.message || "PRASMUL failed to create QRIS order.");
  }

  const remoteOrder = result.data;

  // Pastikan transaksi yang dikembalikan sesuai request.
  if (
    typeof remoteOrder.order_id !== "string" ||
    remoteOrder.order_id.toLowerCase() !== orderId.toLowerCase() ||
    (remoteOrder.payment_method !== undefined &&
      remoteOrder.payment_method !== "QRIS") ||
    remoteOrder.basic_price !== estimate.basicPrice
  ) {
    throw new Error("PRASMUL response does not match the requested order.");
  }

  if (
    typeof remoteOrder.amount !== "number" ||
    !getPrasmulQrString(remoteOrder) ||
    typeof remoteOrder.qr_id !== "string" ||
    !remoteOrder.qr_id
  ) {
    throw new Error("PRASMUL response is missing QRIS payment information.");
  }

  return {
    order: remoteOrder,
    estimate,
    amountMatchesTarget: remoteOrder.amount === targetAmount,
  };
}


