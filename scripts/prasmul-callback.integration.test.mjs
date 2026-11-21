import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { after, before, test } from "node:test";
import mongoose from "mongoose";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/mongodb") {
      return { url: "data:text/javascript,export const connectDB = async () => globalThis.__prasmulCallbackDb", shortCircuit: true };
    }
    if (specifier === "@/lib/prasmul") {
      return {
        url: "data:text/javascript,export class PrasmulApiError extends Error { constructor(message, status) { super(message); this.status = status; } }; export const getPrasmulOrderDetail = async reference => { const state = globalThis.__prasmulCallbackProvider; state.calls++; if (state.error) throw new Error('provider unavailable'); if (reference !== state.reference) throw new Error('unexpected reference'); return state.detail; }",
        shortCircuit: true,
      };
    }
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (specifier.startsWith("@/")) {
      return { url: pathToFileURL(path.join(root, `${specifier.slice(2)}.ts`)).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const { default: Payment } = await import("../src/models/Payment.ts");
const { default: Order } = await import("../src/models/Order.ts");
const { default: Product } = await import("../src/models/Product.ts");
const { default: Notification } = await import("../src/models/Notification.ts");
const { default: Reservation } = await import("../src/models/GreenPointRedemptionReservation.ts");
const { default: Reserve } = await import("../src/models/GreenPointReserveAccount.ts");
const { default: ReserveLedger } = await import("../src/models/GreenPointReserveLedger.ts");
const { POST } = await import("../src/app/api/payments/prasmul/callback/qris/route.ts");
const { POST: postLegacyWebhook } = await import("../src/app/api/payments/prasmul/webhook/route.ts");
const { finalizePrasmulPayment } = await import("../src/lib/prasmul-finalization.ts");
const { verifyPrasmulStatus } = await import("../src/lib/prasmul-status.ts");
let replSet;
let previousNodeEnv;
let previousTestMode;

function request(reference, amount = 15978) {
  return new Request("http://localhost/api/payments/prasmul/callback/qris", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      event: "qr.payment",
      data: { id: "callback-id-not-provider-order-id", reference_id: reference, status: "COMPLETED", amount },
    }),
  });
}

async function fixture({ gpUsed = 0, productStatus = "RESERVED" } = {}) {
  const buyerId = new mongoose.Types.ObjectId();
  const sellerId = new mongoose.Types.ObjectId();
  const product = await Product.create({
    sellerId, name: "Test item", description: "Test", category: "Test", price: 15978,
    size: "M", condition: "GOOD", images: ["https://example.invalid/item.png"], status: productStatus,
  });
  const order = await Order.create({
    buyerId,
    items: [{
      productId: product._id, sellerId, name: "Test item", price: 15978,
      handover: { method: "PICKUP", status: "AWAITING_PAYMENT" },
    }],
    subtotal: 15978, totalAmount: 15978, gpUsed, deliveryMethod: "pickup",
    status: "PENDING_PAYMENT", expiresAt: new Date(Date.now() + 60000),
  });
  const reference = `prasmul-${randomUUID()}`;
  const payment = await Payment.create({
    orderId: order._id, userId: buyerId, midtransOrderId: `test-${randomUUID()}`,
    provider: "PRASMUL", prasmulOrderId: reference, prasmulAmount: 15978,
    grossAmount: 15978, paymentType: "QRIS", status: "PENDING",
  });
  globalThis.__prasmulCallbackProvider = {
    reference, calls: 0,
    detail: { id: 13, order_id: reference, status: "Lunas", payment_method: "QRIS", amount: 15978 },
  };
  return { order, payment, product, sellerId, reference, buyerId };
}

before(async () => {
  previousNodeEnv = process.env.NODE_ENV;
  previousTestMode = process.env.PRASMUL_QRIS_CALLBACK_TEST_MODE;
  process.env.NODE_ENV = "test";
  delete process.env.PRASMUL_QRIS_CALLBACK_TEST_MODE;
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("MONGOMS_")) delete process.env[key];
  }
  const suffix = randomUUID().replaceAll("-", "");
  const setName = `prasmul_${suffix}`;
  const dbName = `prasmul_test_${suffix}`;
  const { MongoMemoryReplSet } = await import("mongodb-memory-server");
  replSet = new MongoMemoryReplSet({
    binary: { version: "8.2.6" },
    replSet: { count: 1, name: setName, ip: "127.0.0.1", storageEngine: "wiredTiger" },
  });
  await replSet.start();
  const info = replSet.servers[0]?.instanceInfo;
  assert.equal(info?.ip, "127.0.0.1");
  assert.ok(info?.instance.mongodProcess?.pid);
  const relativePath = path.relative(tmpdir(), info.dbPath);
  assert.ok(relativePath && !relativePath.startsWith("..") && !path.isAbsolute(relativePath));
  const uri = replSet.getUri(dbName);
  assert.ok(uri.startsWith(`mongodb://127.0.0.1:${info.port}/${dbName}?`));
  await mongoose.connect(uri, { autoIndex: false, serverSelectionTimeoutMS: 10000 });
  const admin = mongoose.connection.db.admin();
  assert.equal((await admin.command({ hello: 1 })).setName, setName);
  assert.equal(Number((await admin.command({ serverStatus: 1 })).pid), info.instance.mongodProcess.pid);
  assert.equal(mongoose.connection.name, dbName);
  globalThis.__prasmulCallbackDb = mongoose;
});

after(async () => {
  delete globalThis.__prasmulCallbackDb;
  delete globalThis.__prasmulCallbackProvider;
  if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previousNodeEnv;
  if (previousTestMode === undefined) delete process.env.PRASMUL_QRIS_CALLBACK_TEST_MODE;
  else process.env.PRASMUL_QRIS_CALLBACK_TEST_MODE = previousTestMode;
  await mongoose.disconnect();
  if (replSet) await replSet.stop();
});

test("verified Lunas finalizes once under concurrent callbacks", async () => {
  const f = await fixture({ gpUsed: 100 });
  await Reserve.create({ _id: "SWAPIT", balance: 1000, reservedRedemptions: 100 });
  await Reservation.create({
    orderId: f.order._id, userId: f.buyerId, amount: 100,
    referenceKey: `test-reservation-${f.order._id}`, status: "PENDING",
  });
  const responses = await Promise.all([
    POST(request(f.reference.toUpperCase())),
    POST(request(f.reference)),
  ]);
  assert.deepEqual(responses.map((response) => response.status), [200, 200]);
  assert.equal((await Payment.findById(f.payment._id).lean()).status, "PAID");
  assert.equal((await Order.findById(f.order._id).lean()).status, "AWAITING_SELLER_HANDOVER");
  assert.equal((await Product.findById(f.product._id).lean()).status, "SOLD_PENDING_HANDOVER");
  assert.equal((await Reservation.findOne({ orderId: f.order._id }).lean()).status, "CONSUMED");
  assert.equal((await Reserve.findById("SWAPIT").lean()).balance, 900);
  assert.equal(await ReserveLedger.countDocuments({ orderId: f.order._id, type: "REDEMPTION" }), 1);
  assert.equal(await Notification.countDocuments({ recipientId: f.sellerId }), 1);
});

test("polling finalization and callback share one atomic payment transition", async () => {
  const f = await fixture();
  const poll = async () => {
    const payment = await Payment.findById(f.payment._id).lean();
    assert.equal(verifyPrasmulStatus(payment, globalThis.__prasmulCallbackProvider.detail), "PAID");
    await finalizePrasmulPayment(payment);
  };
  const [response] = await Promise.all([POST(request(f.reference)), poll()]);
  assert.equal(response.status, 200);
  assert.equal((await Payment.findById(f.payment._id).lean()).status, "PAID");
  assert.equal((await Order.findById(f.order._id).lean()).status, "AWAITING_SELLER_HANDOVER");
  assert.equal((await Product.findById(f.product._id).lean()).status, "SOLD_PENDING_HANDOVER");
  assert.equal(await Notification.countDocuments({ recipientId: f.sellerId }), 1);
});

test("legacy webhook and canonical callback share idempotent finalization", async () => {
  const f = await fixture();
  assert.equal((await postLegacyWebhook(request(f.reference))).status, 200);
  assert.equal((await POST(request(f.reference))).status, 200);
  assert.equal((await Payment.findById(f.payment._id).lean()).status, "PAID");
  assert.equal(await Notification.countDocuments({ recipientId: f.sellerId }), 1);
});

test("callback finalizes when creation metadata has not yet been saved", async () => {
  const f = await fixture();
  await Payment.updateOne({ _id: f.payment._id }, { $unset: { prasmulAmount: 1, prasmulQrId: 1 } });
  globalThis.__prasmulCallbackProvider.detail.qr_id = "provider-qr";
  const responses = await Promise.all([POST(request(f.reference)), POST(request(f.reference))]);
  assert.deepEqual(responses.map((response) => response.status), [200, 200]);
  const payment = await Payment.findById(f.payment._id).lean();
  assert.equal(payment.status, "PAID");
  assert.equal(payment.prasmulAmount, payment.grossAmount);
  assert.equal((await Order.findById(f.order._id).lean()).status, "AWAITING_SELLER_HANDOVER");
  assert.equal(await Notification.countDocuments({ recipientId: f.sellerId }), 1);
});

test("pending, unknown, mismatched and unavailable provider details never finalize", async () => {
  const f = await fixture();
  for (const status of ["Belum Lunas", "Expired"]) {
    globalThis.__prasmulCallbackProvider.detail.status = status;
    assert.equal((await POST(request(f.reference))).status, 409);
  }
  globalThis.__prasmulCallbackProvider.detail.status = "Lunas";
  globalThis.__prasmulCallbackProvider.detail.amount = 15979;
  assert.equal((await POST(request(f.reference))).status, 409);
  globalThis.__prasmulCallbackProvider.error = true;
  assert.equal((await POST(request(f.reference))).status, 502);
  assert.equal((await Payment.findById(f.payment._id).lean()).status, "PENDING");
  assert.equal((await Order.findById(f.order._id).lean()).status, "PENDING_PAYMENT");
  assert.equal((await Product.findById(f.product._id).lean()).status, "RESERVED");
});

test("inconsistent product or missing GP reservation rolls back payment", async () => {
  for (const options of [{ productStatus: "AVAILABLE" }, { gpUsed: 100 }]) {
    const f = await fixture(options);
    assert.equal((await POST(request(f.reference))).status, 409);
    assert.equal((await Payment.findById(f.payment._id).lean()).status, "PENDING");
    assert.equal((await Order.findById(f.order._id).lean()).status, "PENDING_PAYMENT");
    assert.equal(await Notification.countDocuments({ recipientId: f.sellerId }), 0);
  }
});

test("ambiguous references and cancelled orders do not finalize", async () => {
  const ambiguous = await fixture();
  await Payment.create({
    orderId: new mongoose.Types.ObjectId(), userId: new mongoose.Types.ObjectId(),
    midtransOrderId: `test-${randomUUID()}`, provider: "PRASMUL",
    prasmulOrderId: ambiguous.reference.toUpperCase(), prasmulAmount: 15978,
    grossAmount: 15978, paymentType: "QRIS", status: "PENDING",
  });
  assert.equal((await POST(request(ambiguous.reference))).status, 409);
  assert.equal(globalThis.__prasmulCallbackProvider.calls, 0);

  const cancelled = await fixture();
  await Order.updateOne({ _id: cancelled.order._id }, { $set: { status: "CANCELLED" } });
  assert.equal((await POST(request(cancelled.reference))).status, 409);
  assert.equal((await Payment.findById(cancelled.payment._id).lean()).status, "PENDING");
  assert.equal(await Notification.countDocuments({ recipientId: cancelled.sellerId }), 0);
});

test("development simulation never reads provider or changes a real payment", async () => {
  const f = await fixture();
  process.env.NODE_ENV = "development";
  process.env.PRASMUL_QRIS_CALLBACK_TEST_MODE = "true";
  try {
    const response = await POST(request(f.reference));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).paymentProcessed, false);
    assert.equal(globalThis.__prasmulCallbackProvider.calls, 0);
    assert.equal((await Payment.findById(f.payment._id).lean()).status, "PENDING");
  } finally {
    process.env.NODE_ENV = "test";
    delete process.env.PRASMUL_QRIS_CALLBACK_TEST_MODE;
  }
});
