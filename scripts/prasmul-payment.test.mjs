import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import mongoose from "mongoose";
import {
  calculatePrasmulBasicPrice,
  createPrasmulQrOrder,
  getPrasmulOrderDetail,
  getPrasmulOrders,
  getPrasmulOrderReference,
  getPrasmulQrString,
  getPrasmulToken,
  hasUniquePaymentOrderIndex,
  parsePrasmulExpiry,
  PrasmulAmountError,
  PrasmulApiError,
  PrasmulExpiryError,
  PrasmulQrError,
} from "../src/lib/prasmul.ts";
import { parsePaymentProvider } from "../src/lib/payment-provider.ts";
import { verifyPrasmulStatus } from "../src/lib/prasmul-status.ts";

test("provider selection defaults to Xendit and rejects invalid settings", () => {
  assert.equal(parsePaymentProvider(undefined), "XENDIT");
  assert.equal(parsePaymentProvider(" prasmul "), "PRASMUL");
  assert.throws(() => parsePaymentProvider("invalid"), /Invalid payment provider/);
});

test("fee estimation reproduces the observed amount without changing checkout", () => {
  const estimate = calculatePrasmulBasicPrice(358620);
  assert.equal(estimate.basicPrice, 350000);
  assert.equal(estimate.estimatedAmount, 358620);
  assert.throws(() => calculatePrasmulBasicPrice(0), /Invalid/);
  assert.throws(() => calculatePrasmulBasicPrice(5965), /No PRASMUL basic price/);
});

test("provider expiry requires a verified zone or an explicit offset", () => {
  const raw = "2026-11-20 | 14:48:09";
  assert.throws(() => parsePrasmulExpiry(raw), /time zone is not configured/);
  assert.throws(() => parsePrasmulExpiry(raw, "not-a-zone"), /Invalid PRASMUL expiry time zone/);
  assert.equal(parsePrasmulExpiry(raw, "Asia/Jakarta").toISOString(), "2026-11-20T07:48:09.000Z");
  assert.equal(parsePrasmulExpiry(raw, "Asia/Kathmandu").toISOString(), "2026-11-20T09:03:09.000Z");
  assert.equal(parsePrasmulExpiry("2026-11-20T14:48:09+07:00").toISOString(), "2026-11-20T07:48:09.000Z");
  assert.equal(parsePrasmulExpiry("2026-11-20T07:48:09.125Z").toISOString(), "2026-11-20T07:48:09.125Z");
  for (const invalid of ["2026-02-29 | 12:00:00", "2026-11-20 | 24:00:00", "2026-11-20T14:48:09", "2026-11-20T14:48:09+14:30"]) {
    assert.throws(() => parsePrasmulExpiry(invalid, "UTC"), PrasmulExpiryError);
  }
  assert.throws(() => parsePrasmulExpiry("2026-03-08 | 02:30:00", "America/New_York"), /ambiguous or invalid/);
  assert.throws(() => parsePrasmulExpiry("2026-11-01 | 01:30:00", "America/New_York"), /ambiguous or invalid/);
});

test("creation requires an unconditional unique order index", () => {
  assert.equal(hasUniquePaymentOrderIndex([{ key: { orderId: 1 }, unique: true }]), true);
  for (const indexes of [
    [],
    [{ key: { orderId: 1 } }],
    [{ key: { orderId: 1, provider: 1 }, unique: true }],
    [{ key: { orderId: 1 }, unique: true, sparse: true }],
    [{ key: { orderId: 1 }, unique: true, partialFilterExpression: { provider: "PRASMUL" } }],
  ]) {
    assert.equal(hasUniquePaymentOrderIndex(indexes), false);
  }
});

test("concurrent Digital City logins share a request, retry failures, and reuse the token", async () => {
  process.env.PRASMUL_BASE_URL = "https://digitalcity.id";
  process.env.PRASMUL_EMAIL = "test@example.invalid";
  process.env.PRASMUL_PASSWORD = "test-only";
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls += 1;
    assert.equal(url, "https://digitalcity.id/api/partner/auth/login");
    assert.equal(options.method, "POST");
    await new Promise((resolve) => setTimeout(resolve, 10));
    if (calls === 1) return new Response(null, { status: 503 });
    return Response.json({ token: "test-only" });
  };
  try {
    const failed = await Promise.allSettled([getPrasmulToken(), getPrasmulToken(), getPrasmulToken()]);
    assert.ok(failed.every((result) => result.status === "rejected"));
    assert.equal(calls, 1);
    const tokens = await Promise.all([getPrasmulToken(), getPrasmulToken(), getPrasmulToken()]);
    assert.deepEqual(tokens, ["test-only", "test-only", "test-only"]);
    assert.equal(await getPrasmulToken(), "test-only");
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("new references are stable and QR strings reject conflicting values", () => {
  assert.equal(getPrasmulOrderReference("order-123"), "PRASMUL-order-123");
  assert.equal(getPrasmulQrString({ qr_string: "qr-test" }), "qr-test");
  assert.equal(getPrasmulQrString({ payment_code: "legacy-test" }), "legacy-test");
  assert.equal(getPrasmulQrString({ qr_string: "same", payment_code: "same" }), "same");
  assert.throws(() => getPrasmulQrString({ qr_string: "one", payment_code: "two" }), /conflicting/);
});

test("unverified create contract cannot send a provider request", async () => {
  let calls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { calls += 1; throw new Error("unexpected request"); };
  try {
    await assert.rejects(() => createPrasmulQrOrder({
      orderId: "PRASMUL-order-123",
      targetAmount: 358620,
      description: "Test",
      webhookUrl: "https://example.invalid/api/payments/prasmul/webhook",
    }), /contract is not verified/);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("concurrent detail polling refreshes an expired token once", async () => {
  process.env.PRASMUL_BASE_URL = "https://digitalcity.id";
  process.env.PRASMUL_EMAIL = "test@example.invalid";
  process.env.PRASMUL_PASSWORD = "test-only";
  let detailCalls = 0;
  let loginCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (url === "https://digitalcity.id/api/partner/auth/login") {
      loginCalls += 1;
      assert.equal(options.method, "POST");
      await new Promise((resolve) => setTimeout(resolve, 10));
      return Response.json({ token: "refreshed-test-token" });
    }
    assert.equal(url, "https://digitalcity.id/api/partners/order/detail/PRASMUL-ref%2F123/");
    assert.equal(options.method, "GET");
    detailCalls += 1;
    if (options.headers.Authorization === "Token test-only") {
      return new Response(null, { status: 401 });
    }
    assert.equal(options.headers.Authorization, "Token refreshed-test-token");
    return Response.json({ order_id: "PRASMUL-ref/123", status: "Belum Lunas" });
  };
  try {
    const results = await Promise.all([
      getPrasmulOrderDetail("PRASMUL-ref/123"),
      getPrasmulOrderDetail("PRASMUL-ref/123"),
      getPrasmulOrderDetail("PRASMUL-ref/123"),
    ]);
    assert.ok(results.every((result) => result.status === "Belum Lunas"));
    assert.equal(detailCalls, 6);
    assert.equal(loginCalls, 1);
    await assert.rejects(() => getPrasmulOrders(), /listing endpoint is not verified/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

const stored = {
  prasmulOrderId: "reference",
  prasmulQrId: "qr-id",
  prasmulAmount: 358620,
  prasmulBasicPrice: 350000,
  grossAmount: 358620,
};
const remote = {
  order_id: "reference",
  partner_order_id: "test-provider-reference",
  payment_method: "QRIS",
  qr_id: "qr-id",
  amount: 358620,
  basic_price: 350000,
  status: "Belum Lunas",
};

test("only observed PRASMUL status is pending and unknown never means paid", () => {
  assert.equal(verifyPrasmulStatus(stored, remote), "PENDING");
  assert.equal(verifyPrasmulStatus(stored, { ...remote, status: "Lunas" }), "UNKNOWN");
  assert.equal(verifyPrasmulStatus(stored, { ...remote, status: "Expired" }), "UNKNOWN");
  for (const change of [
    { order_id: "other" }, { payment_method: "OTHER" }, { qr_id: "other" },
    { amount: 358621 }, { basic_price: 349999 },
  ]) {
    assert.throws(() => verifyPrasmulStatus(stored, { ...remote, ...change }), /do not match/);
  }
  assert.throws(() => verifyPrasmulStatus({ ...stored, prasmulQrId: undefined }, remote), /do not match/);
});

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
const stubs = {
  "@/lib/authorization": "export const requireAuth = async () => globalThis.__paymentTest.auth;",
  "@/lib/mongodb": "export const connectDB = async () => {};",
  "@/lib/xendit": "export const isXenditTestMode = () => true; export const createXenditQrCode = async () => { throw Error('unexpected create'); }; export const getXenditQrCode = async () => { throw Error('unexpected lookup'); }; export const getXenditPaymentSession = getXenditQrCode;",
  "@/lib/prasmul": "export const { PrasmulApiError, PrasmulAmountError, PrasmulExpiryError, PrasmulQrError, getPrasmulQrString, getPrasmulOrderReference, calculatePrasmulBasicPrice, hasUniquePaymentOrderIndex, parsePrasmulExpiry } = globalThis.__prasmulTestLib; export const createPrasmulQrOrder = async () => { const s = globalThis.__paymentTest; s.creates++; if (!s.fakeProvider) throw Error('unexpected create'); await new Promise(resolve => setTimeout(resolve, 50)); s.providerCreated = true; return { order: s.createdOrder ?? s.remote }; }; export const getPrasmulOrderDetail = async () => { const s = globalThis.__paymentTest; s.lookups++; if (s.lookupError === 'not-found' || (s.fakeProvider && !s.providerCreated)) throw new PrasmulApiError('not found', 404); if (s.lookupError || (s.fakeProvider && s.providerCreated && s.failDetailAfterCreate)) throw Error('timeout'); return s.remote; };",
  "@/lib/prasmul-status": "export let PRASMUL_CONFIRMATION_VERIFIED = false; export const setTestConfirmation = value => { PRASMUL_CONFIRMATION_VERIFIED = value; }; export const verifyPrasmulStatus = (...args) => globalThis.__prasmulTestVerify(...args);",
  "@/models/Payment": "export default { collection: { indexes: async () => globalThis.__paymentTest.realModel ? globalThis.__paymentTest.realModel.collection.indexes() : globalThis.__paymentTest.indexes }, findOne: (...args) => globalThis.__paymentTest.realModel ? globalThis.__paymentTest.realModel.findOne(...args) : ({ lean: async () => globalThis.__paymentTest.payment }), findById: (...args) => globalThis.__paymentTest.realModel ? globalThis.__paymentTest.realModel.findById(...args) : ({ lean: async () => globalThis.__paymentTest.payment }), find: () => ({ sort: () => ({ lean: async () => globalThis.__paymentTest.payment ? [globalThis.__paymentTest.payment] : [] }) }), updateOne: async (...args) => { if (globalThis.__paymentTest.realModel) return globalThis.__paymentTest.realModel.updateOne(...args); const p = globalThis.__paymentTest.payment; for (const [key, value] of Object.entries(args[1].$set)) { if (key.startsWith('paymentData.')) { p.paymentData ??= {}; p.paymentData[key.slice(12)] = value; } else p[key] = value; } globalThis.__paymentTest.mutations++; }, create: async (...args) => { globalThis.__paymentTest.localCreates++; if (globalThis.__paymentTest.realModel) return globalThis.__paymentTest.realModel.create(...args); throw Error('unexpected local create'); }, findOneAndUpdate: async () => { globalThis.__paymentTest.mutations++; throw Error('unexpected payment mutation'); } };",
  "@/models/Order": "export default { findOne: () => ({ lean: async () => globalThis.__paymentTest.order }), exists: async () => true, updateOne: async () => { globalThis.__paymentTest.mutations++; } };",
  "@/models/Cart": "export default {};",
  "@/models/Product": "export default { updateMany: async () => { globalThis.__paymentTest.mutations++; } };",
  "@/lib/green-points": "export const consumeReservedGreenPoints = async () => { globalThis.__paymentTest.mutations++; }; export const restoreReservedGreenPoints = async () => { globalThis.__paymentTest.mutations++; };",
  "@/lib/notifications": "export const createNotificationsForMany = async () => { globalThis.__paymentTest.mutations++; };",
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier in stubs) {
      return { url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`, shortCircuit: true };
    }
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (specifier === "next/navigation") return nextResolve("next/navigation.js", context);
    if (specifier === "./prasmul/route") {
      return { url: pathToFileURL(path.join(root, "app", "api", "payments", "prasmul", "route.ts")).href, shortCircuit: true };
    }
    if (specifier === "../../webhook/route" && context.parentURL?.endsWith("/callback/qris/route.ts")) {
      return { url: pathToFileURL(path.join(root, "app", "api", "payments", "prasmul", "webhook", "route.ts")).href, shortCircuit: true };
    }
    if (specifier.startsWith("@/")) {
      return { url: pathToFileURL(path.join(root, `${specifier.slice(2)}.ts`)).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    if (!url.endsWith("prasmul.ts?legacy-contract-test")) return result;
    const source = String(result.source);
    const guard = "const PRASMUL_CREATE_CONTRACT_VERIFIED = false;";
    assert.ok(source.includes(guard));
    return { ...result, source: source.replace(guard, "const PRASMUL_CREATE_CONTRACT_VERIFIED = true;") };
  },
});

test("legacy Postman create payload is used only in an isolated mock", async () => {
  const { createPrasmulQrOrder: createForTest } = await import("../src/lib/prasmul.ts?legacy-contract-test");
  process.env.PRASMUL_BASE_URL = "https://legacy.example.invalid";
  process.env.PRASMUL_EMAIL = "test@example.invalid";
  process.env.PRASMUL_PASSWORD = "test-only";
  const input = {
    orderId: "PRASMUL-order-123",
    targetAmount: 358620,
    description: "Test",
    webhookUrl: "https://example.invalid/api/payments/prasmul/webhook",
  };
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls += 1;
    if (url === "https://legacy.example.invalid/api/partners/login/") {
      assert.equal(options.method, "POST");
      return Response.json({ token: "test-only" });
    }
    assert.equal(url, "https://legacy.example.invalid/api/partners/orders/");
    assert.equal(options.method, "POST");
    assert.equal(options.headers.Authorization, "Token test-only");
    assert.deepEqual(JSON.parse(options.body), {
      order_id: input.orderId,
      basic_price: 350000,
      payment_method: "QRIS",
      description: input.description,
      callback_url: input.webhookUrl,
    });
    const { payment_method, ...createResponse } = remote;
    void payment_method;
    return Response.json({
      status: "success",
      data: { ...createResponse, order_id: input.orderId, payment_code: "test-qr", expired_payment: "2026-11-20 | 14:48:09" },
    });
  };
  try {
    await assert.rejects(() => createForTest({ ...input, targetAmount: 5965 }), /No PRASMUL basic price/);
    assert.equal(calls, 0);
    const result = await createForTest(input);
    assert.equal(result.amountMatchesTarget, true);
    assert.equal(calls, 2);
    process.env.PRASMUL_BASE_URL = "https://digitalcity.id";
    await assert.rejects(() => createForTest(input), /Digital City order creation contract is not verified/);
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

globalThis.__prasmulTestLib = { PrasmulApiError, PrasmulAmountError, PrasmulExpiryError, PrasmulQrError, getPrasmulQrString, getPrasmulOrderReference, calculatePrasmulBasicPrice, hasUniquePaymentOrderIndex, parsePrasmulExpiry };
globalThis.__prasmulTestVerify = verifyPrasmulStatus;
const { POST, GET } = await import("../src/app/api/payments/route.ts");
const { POST: postWebhook } = await import("../src/app/api/payments/prasmul/webhook/route.ts");
const { POST: postQrisCallback } = await import("../src/app/api/payments/prasmul/callback/qris/route.ts");
const { setTestConfirmation } = await import("@/lib/prasmul-status");
const orderId = "507f1f77bcf86cd799439011";
const future = new Date(Date.now() + 600000);
const makeRequest = (method, requestedOrderId = orderId) => new Request(`http://localhost/api/payments${method === "GET" ? `?orderId=${requestedOrderId}` : ""}`, {
  method,
  ...(method === "POST" ? { body: JSON.stringify({ orderId: requestedOrderId }) } : {}),
});

function setupPayment(payment) {
  globalThis.__paymentTest = {
    auth: { success: true, user: { id: "buyer" } },
    order: { _id: orderId, buyerId: "buyer", status: "PENDING_PAYMENT", expiresAt: future, totalAmount: 358620 },
    payment,
    remote: { ...remote, payment_code: "test-qr", expired_payment: future.toISOString() },
    creates: 0,
    lookups: 0,
    mutations: 0,
    localCreates: 0,
    indexes: [{ key: { orderId: 1 }, unique: true }],
  };
}

test("mocked enabled route rejects unreachable amounts before local or provider creation", async () => {
  process.env.PAYMENT_PROVIDER = "PRASMUL";
  setupPayment(null);
  globalThis.__paymentTest.order.totalAmount = 5965;
  setTestConfirmation(true);
  try {
    const response = await POST(makeRequest("POST"));
    assert.equal(response.status, 409);
    assert.match((await response.json()).message, /exact QRIS amount/);
    assert.equal(globalThis.__paymentTest.localCreates, 0);
    assert.equal(globalThis.__paymentTest.lookups, 0);
    assert.equal(globalThis.__paymentTest.creates, 0);
  } finally {
    setTestConfirmation(false);
  }
});

test("mocked enabled route refuses creation without a verified unique index", async () => {
  process.env.PAYMENT_PROVIDER = "PRASMUL";
  process.env.PRASMUL_WEBHOOK_URL = "https://example.invalid/api/payments/prasmul/callback/qris";
  setupPayment(null);
  globalThis.__paymentTest.indexes = [];
  setTestConfirmation(true);
  try {
    const response = await POST(makeRequest("POST"));
    assert.equal(response.status, 503);
    assert.match((await response.json()).message, /unique payment order index/);
    assert.equal(globalThis.__paymentTest.localCreates, 0);
    assert.equal(globalThis.__paymentTest.lookups, 0);
    assert.equal(globalThis.__paymentTest.creates, 0);
  } finally {
    setTestConfirmation(false);
    delete process.env.PRASMUL_WEBHOOK_URL;
  }
});

test("mocked enabled route refuses to recreate an existing order after provider 404", async () => {
  process.env.PAYMENT_PROVIDER = "PRASMUL";
  setupPayment({
    ...stored, _id: orderId, orderId, userId: "buyer", provider: "PRASMUL",
    prasmulOrderId: `PRASMUL-${orderId}`, status: "PENDING",
  });
  globalThis.__paymentTest.lookupError = "not-found";
  setTestConfirmation(true);
  try {
    const responses = await Promise.all([POST(makeRequest("POST")), POST(makeRequest("POST"))]);
    assert.deepEqual(responses.map((response) => response.status), [409, 409]);
    assert.equal(globalThis.__paymentTest.lookups, 2);
    assert.equal(globalThis.__paymentTest.creates, 0);
    assert.equal(globalThis.__paymentTest.localCreates, 0);
  } finally {
    setTestConfirmation(false);
  }
});

test("mocked enabled route rejects missing or mismatched stored references", async () => {
  process.env.PAYMENT_PROVIDER = "PRASMUL";
  setupPayment({ ...stored, _id: orderId, orderId, provider: "PRASMUL", status: "PENDING" });
  setTestConfirmation(true);
  try {
    for (const reference of [undefined, "unrelated-reference"]) {
      globalThis.__paymentTest.payment.prasmulOrderId = reference;
      assert.equal((await POST(makeRequest("POST"))).status, 409);
    }
    assert.equal(globalThis.__paymentTest.lookups, 0);
    assert.equal(globalThis.__paymentTest.creates, 0);
  } finally {
    setTestConfirmation(false);
  }
});

test("mocked enabled route saves mismatched amount even when expiry zone is unknown", async () => {
  process.env.PAYMENT_PROVIDER = "PRASMUL";
  delete process.env.PRASMUL_TIME_ZONE;
  setupPayment({
    ...stored, _id: orderId, orderId, userId: "buyer", provider: "PRASMUL",
    prasmulOrderId: `PRASMUL-${orderId}`, status: "PENDING",
  });
  globalThis.__paymentTest.remote = {
    ...remote, order_id: `PRASMUL-${orderId}`, amount: 358621,
    expired_payment: "2026-11-20 | 14:48:09", payment_code: "test-qr", qr_string: "conflicting-test-qr",
  };
  setTestConfirmation(true);
  try {
    const response = await POST(makeRequest("POST"));
    assert.equal(response.status, 409);
    assert.match((await response.json()).message, /manual reconciliation/);
    assert.equal(globalThis.__paymentTest.payment.prasmulAmount, 358621);
    assert.equal(globalThis.__paymentTest.payment.paymentData.prasmulExpiredPaymentRaw, "2026-11-20 | 14:48:09");
    assert.equal(globalThis.__paymentTest.payment.prasmulExpiredPayment, undefined);
  } finally {
    setTestConfirmation(false);
  }
});

test("mocked enabled route accepts a matching future expiry and hides expired or unzoned QR", async () => {
  process.env.PAYMENT_PROVIDER = "PRASMUL";
  process.env.PRASMUL_TIME_ZONE = "UTC";
  setupPayment({
    ...stored, _id: orderId, orderId, userId: "buyer", provider: "PRASMUL",
    prasmulOrderId: `PRASMUL-${orderId}`, status: "PENDING",
  });
  globalThis.__paymentTest.remote = {
    ...remote, order_id: `PRASMUL-${orderId}`, payment_code: "test-qr",
    expired_payment: future.toISOString().slice(0, 19).replace("T", " | "),
  };
  setTestConfirmation(true);
  try {
    let response = await POST(makeRequest("POST"));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.grossAmount, 358620);
    assert.equal(globalThis.__paymentTest.payment.paymentData.prasmulPartnerOrderId, "test-provider-reference");
    response = await GET(makeRequest("GET"));
    assert.equal((await response.json()).data[0].qrString, "test-qr");

    globalThis.__paymentTest.remote.expired_payment = new Date(Date.now() - 60000).toISOString();
    response = await POST(makeRequest("POST"));
    assert.equal(response.status, 409);
    response = await GET(makeRequest("GET"));
    const expired = (await response.json()).data[0];
    assert.equal(expired.qrString, undefined);
    assert.equal(expired.status, "PENDING");
    assert.equal(expired.verificationStatus, "PENDING");

    delete process.env.PRASMUL_TIME_ZONE;
    globalThis.__paymentTest.remote.expired_payment = future.toISOString().slice(0, 19).replace("T", " | ");
    response = await POST(makeRequest("POST"));
    assert.equal(response.status, 409);
    response = await GET(makeRequest("GET"));
    const unzoned = (await response.json()).data[0];
    assert.equal(unzoned.qrString, undefined);
    assert.equal(unzoned.expiredPayment, undefined);
    assert.equal(unzoned.verificationStatus, "PENDING");
  } finally {
    setTestConfirmation(false);
    delete process.env.PRASMUL_TIME_ZONE;
  }
});

test("isolated MongoDB unique index prevents concurrent duplicate PRASMUL creates with a mocked provider", async () => {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("MONGOMS_")) delete process.env[key];
  }
  process.env.MONGOMS_RUNTIME_DOWNLOAD = "false";
  const { MongoMemoryReplSet } = await import("mongodb-memory-server");
  const suffix = randomUUID().replaceAll("-", "");
  const setName = `swapit_${suffix}`;
  const dbName = `swapit_test_${suffix}`;
  const replSet = new MongoMemoryReplSet({
    binary: { version: "8.2.6" },
    replSet: { count: 1, name: setName, ip: "127.0.0.1", storageEngine: "wiredTiger" },
  });
  let connection;
  try {
    assert.equal(mongoose.connection.readyState, 0);
    await replSet.start();
    const info = replSet.servers[0]?.instanceInfo;
    assert.equal(replSet.servers.length, 1);
    assert.equal(info?.ip, "127.0.0.1");
    assert.ok(info?.instance.mongodProcess?.pid);
    const relativePath = path.relative(tmpdir(), info.dbPath);
    assert.ok(relativePath && !relativePath.startsWith("..") && !path.isAbsolute(relativePath));
    const uri = replSet.getUri(dbName);
    assert.ok(uri.startsWith(`mongodb://127.0.0.1:${info.port}/${dbName}?`));
    connection = await mongoose.createConnection(uri, { autoIndex: false, serverSelectionTimeoutMS: 10000 }).asPromise();
    const admin = connection.db.admin();
    assert.equal((await admin.command({ hello: 1 })).setName, setName);
    assert.equal(Number((await admin.command({ serverStatus: 1 })).pid), info.instance.mongodProcess.pid);
    assert.equal(connection.name, dbName);
    await mongoose.connect(uri, { autoIndex: false, serverSelectionTimeoutMS: 10000 });

    const { default: realPayment } = await import("../src/models/Payment.ts");
    await realPayment.createIndexes();
    assert.equal(hasUniquePaymentOrderIndex(await realPayment.collection.indexes()), true);
    process.env.PAYMENT_PROVIDER = "PRASMUL";
    process.env.PRASMUL_WEBHOOK_URL = "https://example.invalid/api/payments/prasmul/webhook";
    setupPayment(null);
    globalThis.__paymentTest.realModel = realPayment;
    globalThis.__paymentTest.fakeProvider = true;
    globalThis.__paymentTest.order.buyerId = "507f1f77bcf86cd799439012";
    globalThis.__paymentTest.auth.user.id = globalThis.__paymentTest.order.buyerId;
    globalThis.__paymentTest.remote = {
      ...remote, order_id: `PRASMUL-${orderId}`, payment_code: "test-qr",
      expired_payment: future.toISOString(),
    };
    setTestConfirmation(true);
    const responses = await Promise.all([POST(makeRequest("POST")), POST(makeRequest("POST"))]);
    assert.ok(responses.some((response) => response.status === 200));
    assert.ok(responses.every((response) => response.status === 200 || response.status === 409));
    assert.equal(await realPayment.countDocuments({ orderId }), 1);
    assert.equal(globalThis.__paymentTest.creates, 1);
    assert.equal((await POST(makeRequest("POST"))).status, 200);
    assert.equal(globalThis.__paymentTest.creates, 1);

    const secondOrderId = "507f1f77bcf86cd799439013";
    setupPayment(null);
    globalThis.__paymentTest.realModel = realPayment;
    globalThis.__paymentTest.fakeProvider = true;
    globalThis.__paymentTest.failDetailAfterCreate = true;
    globalThis.__paymentTest.order._id = secondOrderId;
    globalThis.__paymentTest.order.buyerId = "507f1f77bcf86cd799439012";
    globalThis.__paymentTest.auth.user.id = globalThis.__paymentTest.order.buyerId;
    globalThis.__paymentTest.createdOrder = {
      order_id: `PRASMUL-${secondOrderId}`, qr_id: "qr-id", basic_price: 350000,
      amount: 358620, status: "Belum Lunas", expired_payment: "2026-11-20 | 14:48:09",
      partner_order_id: "test-provider-reference", payment_code: "test-qr",
    };
    assert.equal((await POST(makeRequest("POST", secondOrderId))).status, 502);
    const saved = await realPayment.findOne({ orderId: secondOrderId }).lean();
    assert.equal(saved.paymentData.prasmulCreateResponse.amount, 358620);
    assert.equal(saved.paymentData.prasmulCreateResponse.orderId, `PRASMUL-${secondOrderId}`);
    assert.equal(saved.paymentData.prasmulCreateResponse.partnerOrderId, "test-provider-reference");
    assert.equal(saved.paymentData.prasmulCreateResponse.payment_code, undefined);
    assert.equal((await POST(makeRequest("POST", secondOrderId))).status, 502);
    assert.equal(globalThis.__paymentTest.creates, 1);

    const thirdOrderId = "507f1f77bcf86cd799439014";
    setupPayment(null);
    globalThis.__paymentTest.realModel = realPayment;
    globalThis.__paymentTest.fakeProvider = true;
    globalThis.__paymentTest.order._id = thirdOrderId;
    globalThis.__paymentTest.order.buyerId = "507f1f77bcf86cd799439012";
    globalThis.__paymentTest.auth.user.id = globalThis.__paymentTest.order.buyerId;
    globalThis.__paymentTest.createdOrder = {
      order_id: `PRASMUL-${thirdOrderId}`, qr_id: "qr-id", basic_price: 350000,
      amount: 358621, status: "Belum Lunas", expired_payment: future.toISOString(),
      payment_code: "test-qr",
    };
    const mismatch = await POST(makeRequest("POST", thirdOrderId));
    assert.equal(mismatch.status, 409);
    assert.equal((await mismatch.json()).data, undefined);
    const mismatchedPayment = await realPayment.findOne({ orderId: thirdOrderId }).lean();
    assert.equal(mismatchedPayment.paymentData.prasmulCreateResponse.amount, 358621);
    assert.equal(mismatchedPayment.prasmulPaymentCode, undefined);
    assert.equal(globalThis.__paymentTest.lookups, 1);
    assert.equal(globalThis.__paymentTest.creates, 1);
  } finally {
    setTestConfirmation(false);
    delete process.env.PRASMUL_WEBHOOK_URL;
    delete globalThis.__paymentTest.realModel;
    await mongoose.disconnect();
    if (connection) await connection.close();
    await replSet.stop();
  }
});

test("main endpoint blocks concurrent new PRASMUL creation and retries without remote requests", async () => {
  process.env.PAYMENT_PROVIDER = "PRASMUL";
  setupPayment(null);
  const responses = await Promise.all([POST(makeRequest("POST")), POST(makeRequest("POST")), POST(makeRequest("POST"))]);
  assert.deepEqual(responses.map((response) => response.status), [503, 503, 503]);
  assert.equal(globalThis.__paymentTest.creates, 0);
  assert.equal(globalThis.__paymentTest.lookups, 0);
});

test("main endpoint hides PRASMUL QR until confirmation is implemented", async () => {
  process.env.PAYMENT_PROVIDER = "PRASMUL";
  setupPayment({
    ...stored, _id: orderId, orderId, userId: "buyer", provider: "PRASMUL",
    status: "PENDING", prasmulPaymentCode: "test-qr", prasmulExpiredPayment: future,
    paymentData: { secret: "not-for-client" },
  });
  let response = await GET(makeRequest("GET"));
  let payment = (await response.json()).data[0];
  assert.equal(payment.qrString, undefined);
  assert.equal(payment.verificationStatus, "PENDING");
  assert.equal(payment.prasmulPaymentCode, undefined);
  assert.equal(payment.paymentData, undefined);
  globalThis.__paymentTest.remote.status = "Lunas";
  response = await GET(makeRequest("GET"));
  payment = (await response.json()).data[0];
  assert.equal(payment.status, "PENDING");
  assert.equal(payment.verificationStatus, "UNKNOWN");
  assert.equal(payment.qrString, undefined);
  globalThis.__paymentTest.lookupError = true;
  response = await GET(makeRequest("GET"));
  payment = (await response.json()).data[0];
  assert.equal(payment.verificationStatus, "UNKNOWN");
  assert.equal(payment.qrString, undefined);
  assert.equal(globalThis.__paymentTest.creates, 0);
});

test("repeated polling of pending and unknown statuses never finalizes payment", async () => {
  process.env.PAYMENT_PROVIDER = "PRASMUL";
  setupPayment({
    ...stored, _id: orderId, orderId, userId: "buyer", provider: "PRASMUL",
    status: "PENDING", prasmulPaymentCode: "test-qr", prasmulExpiredPayment: future,
  });
  for (const status of ["Belum Lunas", "Lunas", "Expired"]) {
    globalThis.__paymentTest.remote.status = status;
    const responses = await Promise.all([GET(makeRequest("GET")), GET(makeRequest("GET"))]);
    for (const response of responses) {
      const payment = (await response.json()).data[0];
      assert.equal(payment.status, "PENDING");
      assert.equal(payment.verificationStatus, status === "Belum Lunas" ? "PENDING" : "UNKNOWN");
    }
  }
  assert.equal(globalThis.__paymentTest.lookups, 6);
  assert.equal(globalThis.__paymentTest.mutations, 0);
});

test("mismatched provider amounts remain unverified and do not expose stored QR", async () => {
  process.env.PAYMENT_PROVIDER = "PRASMUL";
  setupPayment({
    ...stored, _id: orderId, orderId, userId: "buyer", provider: "PRASMUL",
    status: "PENDING", prasmulPaymentCode: "test-qr", prasmulExpiredPayment: future,
  });
  globalThis.__paymentTest.remote.amount = 358621;
  const response = await GET(makeRequest("GET"));
  const payment = (await response.json()).data[0];
  assert.equal(payment.verificationStatus, "UNKNOWN");
  assert.equal(payment.qrString, undefined);
  assert.equal(payment.prasmulPaymentCode, undefined);
});

test("payment endpoints reject unauthenticated callers", async () => {
  process.env.PAYMENT_PROVIDER = "PRASMUL";
  setupPayment(null);
  globalThis.__paymentTest.auth = {
    success: false,
    response: Response.json({ success: false }, { status: 401 }),
  };
  assert.equal((await POST(makeRequest("POST"))).status, 401);
  assert.equal((await GET(makeRequest("GET"))).status, 401);
});

test("unverified webhook refuses delivery without processing payment", async () => {
  const response = await postWebhook(new Request("http://localhost/api/payments/prasmul/webhook", {
    method: "POST",
    body: "untrusted-event",
  }));
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("QRIS callback refuses unverified and repeated payloads without payment side effects", async () => {
  const previous = process.env.PRASMUL_QRIS_CALLBACK_TEST_MODE;
  delete process.env.PRASMUL_QRIS_CALLBACK_TEST_MODE;
  setupPayment(null);
  try {
    for (const body of [
      "not-json",
      JSON.stringify({ order_id: "unrecognized", amount: 358620 }),
      JSON.stringify({ order_id: "PRASMUL-test", status: "unverified" }),
      JSON.stringify({ order_id: "PRASMUL-test", status: "unverified" }),
    ]) {
      const response = await postQrisCallback(new Request("http://localhost/api/payments/prasmul/callback/qris", {
        method: "POST",
        body,
      }));
      assert.equal(response.status, 503);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal((await response.json()).success, false);
    }
    assert.equal(globalThis.__paymentTest.lookups, 0);
    assert.equal(globalThis.__paymentTest.creates, 0);
    assert.equal(globalThis.__paymentTest.mutations, 0);
  } finally {
    if (previous === undefined) delete process.env.PRASMUL_QRIS_CALLBACK_TEST_MODE;
    else process.env.PRASMUL_QRIS_CALLBACK_TEST_MODE = previous;
  }
});

test("QRIS callback test mode validates sample payloads without processing payments", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousTestMode = process.env.PRASMUL_QRIS_CALLBACK_TEST_MODE;
  process.env.NODE_ENV = "development";
  process.env.PRASMUL_QRIS_CALLBACK_TEST_MODE = "true";
  setupPayment(null);
  const data = {
    id: "simulasi-qris-icdec-01",
    reference_id: `PRASMUL-${orderId}`,
    status: "COMPLETED",
    amount: 157050,
  };
  const request = (body, contentType = "application/json") => new Request(
    "http://localhost/api/payments/prasmul/callback/qris",
    { method: "POST", headers: { "Content-Type": contentType }, body },
  );
  try {
    const body = JSON.stringify({ event: "qr.payment", data });
    for (let i = 0; i < 2; i++) {
      const response = await postQrisCallback(request(body, "application/json; charset=utf-8"));
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.deepEqual(await response.json(), {
        success: true,
        mode: "TEST",
        authenticated: false,
        paymentProcessed: false,
        message: "Test payload accepted; no payment was processed.",
      });
    }
    const invalid = [
      "not-json",
      JSON.stringify(null),
      JSON.stringify({ event: "other", data }),
      JSON.stringify({ event: "qr.payment", data: [] }),
      ...[
        { id: "" },
        { id: 12 },
        { reference_id: "other" },
        { reference_id: "PRASMUL-" },
        { status: "PENDING" },
        { amount: "157050" },
        { amount: null },
      ].map((change) => JSON.stringify({ event: "qr.payment", data: { ...data, ...change } })),
      '{"event":"qr.payment","data":{"id":"test","reference_id":"PRASMUL-test","status":"COMPLETED","amount":1e309}}',
    ];
    for (const body of invalid) {
      const response = await postQrisCallback(request(body));
      assert.equal(response.status, 400);
      assert.equal((await response.json()).success, false);
    }
    assert.equal((await postQrisCallback(request(body, "text/plain"))).status, 415);
    process.env.NODE_ENV = "production";
    assert.equal((await postQrisCallback(request(body))).status, 503);
    assert.equal(globalThis.__paymentTest.lookups, 0);
    assert.equal(globalThis.__paymentTest.creates, 0);
    assert.equal(globalThis.__paymentTest.mutations, 0);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousTestMode === undefined) delete process.env.PRASMUL_QRIS_CALLBACK_TEST_MODE;
    else process.env.PRASMUL_QRIS_CALLBACK_TEST_MODE = previousTestMode;
  }
});

test("Xendit existing QR is reused and PRASMUL record cannot be overwritten", async () => {
  process.env.PAYMENT_PROVIDER = "XENDIT";
  setupPayment({ _id: orderId, orderId, provider: "XENDIT", status: "PENDING", xenditQrString: "xendit-qr", grossAmount: 358620 });
  let response = await POST(makeRequest("POST"));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data.qrString, "xendit-qr");
  globalThis.__paymentTest.payment.provider = "PRASMUL";
  response = await POST(makeRequest("POST"));
  assert.equal(response.status, 409);
});
