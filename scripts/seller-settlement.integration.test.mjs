import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { after, before, test } from "node:test";
import mongoose from "mongoose";
import SellerPayable from "../src/models/SellerPayable.ts";
import SellerRecovery from "../src/models/SellerRecovery.ts";
import SellerSettlementLedger from "../src/models/SellerSettlementLedger.ts";
import SettlementOrderFence from "../src/models/SettlementOrderFence.ts";
import BuyerRefundEntitlement from "../src/models/BuyerRefundEntitlement.ts";
import SettlementFinancialHold from "../src/models/SettlementFinancialHold.ts";
import SettlementFinancialControlEvent from "../src/models/SettlementFinancialControlEvent.ts";
import SettlementVerification from "../src/models/SettlementVerification.ts";
import SettlementVerificationSnapshotItem from "../src/models/SettlementVerificationSnapshotItem.ts";
import SettlementActorResolution from "../src/models/SettlementActorResolution.ts";
import { touchSettlementOrderFence } from "../src/lib/settlement-order-fence.ts";
import { recordSettlementMutation } from "../src/lib/settlement-mutation.ts";
import { readSettlementSnapshot } from "../src/lib/settlement-snapshot-reader.ts";
import { createSettlementFinancialHold } from "../src/lib/settlement-holds.ts";

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
registerHooks({
  resolve(specifier, context, nextResolve) {
    const parentUrl = context.parentURL ? decodeURIComponent(context.parentURL) : "";
    const isSettlementRoute = parentUrl.endsWith("/src/app/api/admin/settlements/route.ts");
    const isResolutionQueueRoute = parentUrl.endsWith("/src/app/api/admin/seller-financial-resolutions/route.ts");
    const isBuyerQcRoute = parentUrl.endsWith("/src/app/api/orders/[id]/qc-decision/route.ts");
    const isPickupRoute = parentUrl.endsWith("/src/app/api/orders/route.ts") || parentUrl.endsWith("/src/app/api/admin/orders/route.ts") || parentUrl.endsWith("/src/app/api/orders/[id]/confirm-received/route.ts");
    if (isSettlementRoute || isResolutionQueueRoute || isBuyerQcRoute || isPickupRoute) {
      if (specifier === "@/lib/authorization") {
        return { url: "data:text/javascript,export const requireRole = async () => globalThis.__settlementTestAuth; export const requireAuth = requireRole", shortCircuit: true };
      }
      if (specifier === "next/server") {
        return nextResolve("next/server.js", context);
      }
    }
    if (specifier === "@/lib/mongodb" && (isSettlementRoute || isResolutionQueueRoute || isBuyerQcRoute || isPickupRoute || parentUrl.endsWith("/src/lib/notifications.ts"))) {
      return { url: "data:text/javascript,export const connectDB = async () => globalThis.__settlementTestConnection", shortCircuit: true };
    }
    if (specifier.startsWith("@/")) {
      return { url: pathToFileURL(path.join(sourceRoot, `${specifier.slice(2)}.ts`)).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
const { createSellerPayablesForCompletedOrder } = await import("../src/lib/seller-settlement.ts");
const { default: Order } = await import("../src/models/Order.ts");
const { default: Refund } = await import("../src/models/Refund.ts");
const { default: RefundTransaction } = await import("../src/models/RefundTransaction.ts");
const { default: GreenPointLedger } = await import("../src/models/GreenPointLedger.ts");
const { default: PendingGreenPointCredit } = await import("../src/models/PendingGreenPointCredit.ts");
const { default: SellerFinancialResolution } = await import("../src/models/SellerFinancialResolution.ts");
const { default: SellerFinancialResolutionItem } = await import("../src/models/SellerFinancialResolutionItem.ts");
const { approveRefund, createQcCompensation, createHandoverDeadlineRefund } = await import("../src/lib/refunds.ts");
const { topUpGreenPointReserve } = await import("../src/lib/green-points.ts");
const { processSellerFinancialResolution, recordSellerResolutionFailure } = await import("../src/lib/seller-financial-resolution.ts");
const { POST: postSettlement, GET: getSettlements } = await import("../src/app/api/admin/settlements/route.ts");
const { GET: getResolutionQueue } = await import("../src/app/api/admin/seller-financial-resolutions/route.ts");
const { POST: postBuyerQcDecision } = await import("../src/app/api/orders/[id]/qc-decision/route.ts");
const { POST: createBuyerOrder } = await import("../src/app/api/orders/route.ts");
const { POST: updateDelivery } = await import("../src/app/api/admin/orders/route.ts");
const { POST: confirmReceipt } = await import("../src/app/api/orders/[id]/confirm-received/route.ts");
const { default: Cart } = await import("../src/models/Cart.ts");
const { default: Product } = await import("../src/models/Product.ts");

let replSet;
let connection;
let Payable;
let Recovery;
let Ledger;
let Entitlement;
let Hold;
let ControlEvent;
let Verification;
let SnapshotItem;

before(async () => {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("MONGOMS_")) delete process.env[key];
  }
  process.env.MONGOMS_RESUME_DOWNLOAD = "true";

  const { MongoMemoryReplSet } = await import("mongodb-memory-server");
  const suffix = randomUUID().replaceAll("-", "");
  const setName = `swapit_${suffix}`;
  const dbName = `swapit_test_${suffix}`;
  replSet = new MongoMemoryReplSet({
    binary: { version: "8.2.6" },
    replSet: { count: 1, name: setName, ip: "127.0.0.1", storageEngine: "wiredTiger" },
  });
  await replSet.start();

  const info = replSet.servers[0]?.instanceInfo;
  assert.equal(replSet.servers.length, 1);
  assert.equal(info?.ip, "127.0.0.1");
  assert.ok(info?.instance.mongodProcess?.pid);
  const relativePath = path.relative(tmpdir(), info.dbPath);
  assert.ok(relativePath && !relativePath.startsWith("..") && !path.isAbsolute(relativePath));

  const uri = replSet.getUri(dbName);
  const expectedPrefix = `mongodb://127.0.0.1:${info.port}/${dbName}`;
  assert.ok(uri.startsWith(`${expectedPrefix}?`));
  connection = await mongoose.createConnection(uri, {
    autoIndex: false,
    serverSelectionTimeoutMS: 10000,
  }).asPromise();

  const admin = connection.db.admin();
  const hello = await admin.command({ hello: 1 });
  const serverStatus = await admin.command({ serverStatus: 1 });
  assert.equal(hello.setName, setName);
  assert.equal(Number(serverStatus.pid), info.instance.mongodProcess.pid);
  assert.equal(connection.name, dbName);

  await mongoose.connect(uri, { autoIndex: false, serverSelectionTimeoutMS: 10000 });
  globalThis.__settlementTestConnection = mongoose;
  globalThis.__settlementTestAuth = {
    success: true,
    user: { id: new mongoose.Types.ObjectId().toString(), role: "ADMIN" },
  };
  Payable = connection.model("SellerPayable", SellerPayable.schema);
  Recovery = connection.model("SellerRecovery", SellerRecovery.schema);
  Ledger = connection.model("SellerSettlementLedger", SellerSettlementLedger.schema);
  Entitlement = connection.model("BuyerRefundEntitlement", BuyerRefundEntitlement.schema);
  Hold = connection.model("SettlementFinancialHold", SettlementFinancialHold.schema);
  ControlEvent = connection.model("SettlementFinancialControlEvent", SettlementFinancialControlEvent.schema);
  Verification = connection.model("SettlementVerification", SettlementVerification.schema);
  SnapshotItem = connection.model("SettlementVerificationSnapshotItem", SettlementVerificationSnapshotItem.schema);
  await Promise.all([
    Payable.createIndexes(), Recovery.createIndexes(), Ledger.createIndexes(),
    Entitlement.createIndexes(), Hold.createIndexes(), ControlEvent.createIndexes(),
    Verification.createIndexes(), SnapshotItem.createIndexes(),
    RefundTransaction.createIndexes(), GreenPointLedger.createIndexes(),
    PendingGreenPointCredit.createIndexes(), SellerFinancialResolution.createIndexes(),
    SellerFinancialResolutionItem.createIndexes(),
  ]);
});

after(async () => {
  delete globalThis.__settlementTestAuth;
  delete globalThis.__settlementTestConnection;
  await mongoose.disconnect();
  if (connection) await connection.close();
  if (replSet) await replSet.stop();
});

test("buyer pickup is free and requires QC and hub confirmation before collection", async () => {
  const buyerId = new mongoose.Types.ObjectId();
  const sellerId = new mongoose.Types.ObjectId();
  const adminId = new mongoose.Types.ObjectId();
  const product = await Product.create({
    sellerId, name: "Pickup item", description: "Test", category: "Tops",
    price: 100_000, size: "M", condition: "GOOD", images: ["https://example.com/item.jpg"],
    status: "AVAILABLE",
  });
  await Cart.create({ userId: buyerId, items: [{ productId: product._id }] });
  const request = (body) => new Request("http://localhost/api/orders", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  globalThis.__settlementTestAuth = { success: true, user: { id: buyerId.toString(), role: "USER" } };
  const invalid = await createBuyerOrder(request({ deliveryMethod: "pickup", pickupHubId: "unknown" }));
  assert.equal(invalid.status, 400);
  const created = await createBuyerOrder(request({ deliveryMethod: "pickup", pickupHubId: "hub-bsd", gpUsed: 0 }));
  assert.equal(created.status, 201);
  const { data } = await created.json();
  assert.equal(data.shippingFee, 0);
  assert.equal(data.totalAmount, 103_000);
  assert.equal(data.pickupHub.id, "hub-bsd");
  assert.equal(data.shippingAddress, undefined);
  assert.equal((await Cart.findOne({ userId: buyerId }).lean()).items.length, 0);

  globalThis.__settlementTestAuth = { success: true, user: { id: adminId.toString(), role: "ADMIN" } };
  const update = (action) => updateDelivery(request({ orderId: data._id, action }));
  assert.equal((await update("READY_FOR_PICKUP")).status, 409);
  await Order.updateOne({ _id: data._id }, { $set: { status: "PROCESSING", "items.0.qcStatus": "PENDING" } });
  assert.equal((await update("READY_FOR_PICKUP")).status, 409);
  await Order.updateOne({ _id: data._id }, { $set: { "items.0.qcStatus": "PASSED" } });
  assert.equal((await update("SHIPPED")).status, 409);
  assert.equal((await update("PICKED_UP")).status, 409);
  assert.equal((await update("READY_FOR_PICKUP")).status, 200);
  assert.equal((await Order.findById(data._id).lean()).status, "READY_FOR_PICKUP");
  globalThis.__settlementTestAuth = { success: true, user: { id: buyerId.toString(), role: "USER" } };
  const context = { params: Promise.resolve({ id: data._id }) };
  assert.equal((await confirmReceipt(request({}), context)).status, 409);
  globalThis.__settlementTestAuth = { success: true, user: { id: adminId.toString(), role: "ADMIN" } };
  assert.equal((await update("PICKED_UP")).status, 200);
  const collected = await Order.findById(data._id).lean();
  assert.equal(collected.status, "DELIVERED");
  assert.deepEqual(collected.shipmentEvents.map((event) => event.status), ["READY_FOR_PICKUP", "PICKED_UP"]);
  globalThis.__settlementTestAuth = { success: true, user: { id: buyerId.toString(), role: "USER" } };
  assert.equal((await confirmReceipt(request({}), context)).status, 200);
  assert.equal((await Order.findById(data._id).lean()).status, "COMPLETED");
  assert.equal(await SellerPayable.countDocuments({ orderId: data._id, sellerId }), 1);
  globalThis.__settlementTestAuth = { success: true, user: { id: adminId.toString(), role: "ADMIN" } };
});

test("courier delivery retains its shipment sequence", async () => {
  const order = await Order.create({
    buyerId: new mongoose.Types.ObjectId(),
    items: [{ productId: new mongoose.Types.ObjectId(), sellerId: new mongoose.Types.ObjectId(), name: "Item", price: 100_000, qcStatus: "PASSED" }],
    subtotal: 100_000, totalAmount: 103_000, deliveryMethod: "courier",
    status: "PROCESSING", expiresAt: new Date(Date.now() + 60_000),
  });
  const update = (action) => updateDelivery(new Request("http://localhost/api/admin/orders", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ orderId: order._id.toString(), action }),
  }));
  assert.equal((await update("READY_FOR_PICKUP")).status, 409);
  assert.equal((await update("SHIPPED")).status, 200);
  assert.equal((await update("DELIVERED")).status, 200);
  assert.equal((await Order.findById(order._id).lean()).status, "DELIVERED");
});

test("order fence requires an active transaction", async () => {
  const session = await mongoose.startSession();
  try {
    await assert.rejects(
      () => touchSettlementOrderFence(new mongoose.Types.ObjectId(), session),
      /requires an active transaction/,
    );
  } finally {
    await session.endSession();
  }
});

test("competing transactions conflict on the same order fence", async () => {
  const orderId = new mongoose.Types.ObjectId();
  await SettlementOrderFence.create({ _id: orderId, revision: 0 });
  const first = await mongoose.startSession();
  const second = await mongoose.startSession();
  try {
    first.startTransaction();
    second.startTransaction();
    await touchSettlementOrderFence(orderId, first);
    const contested = touchSettlementOrderFence(orderId, second).then(
      () => null,
      (error) => error,
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    await first.commitTransaction();
    const error = await contested;
    assert.ok(error instanceof Error);
    assert.equal(error.hasErrorLabel?.("TransientTransactionError"), true);
    await second.abortTransaction();
    await second.withTransaction(() => touchSettlementOrderFence(orderId, second));
    const fence = await SettlementOrderFence.findById(orderId).lean();
    assert.equal(fence.revision, 2);
  } finally {
    if (first.inTransaction()) await first.abortTransaction();
    if (second.inTransaction()) await second.abortTransaction();
    await first.endSession();
    await second.endSession();
  }
});

test("competing transactions on a new order fence do not both commit", async () => {
  const orderId = new mongoose.Types.ObjectId();
  const first = await mongoose.startSession();
  const second = await mongoose.startSession();
  try {
    first.startTransaction();
    second.startTransaction();
    await touchSettlementOrderFence(orderId, first);
    const contested = touchSettlementOrderFence(orderId, second).then(
      () => null,
      (error) => error,
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    await first.commitTransaction();
    const error = await contested;
    assert.ok(error instanceof Error);
    assert.equal(error.hasErrorLabel?.("TransientTransactionError"), true);
    if (second.inTransaction()) await second.abortTransaction();
    await second.withTransaction(() => touchSettlementOrderFence(orderId, second));
    assert.equal((await SettlementOrderFence.findById(orderId).lean()).revision, 2);
  } finally {
    if (first.inTransaction()) await first.abortTransaction();
    if (second.inTransaction()) await second.abortTransaction();
    await first.endSession();
    await second.endSession();
  }
});

test("isolated MongoDB persists payable and ledger in one transaction", async () => {
  const orderId = new mongoose.Types.ObjectId();
  const sellerId = new mongoose.Types.ObjectId();
  const actorId = new mongoose.Types.ObjectId();
  const payable = await Payable.create({
    orderId,
    sellerId,
    sellerSubtotal: 105_500,
    transactionFee: 5_500,
    payableAmount: 100_000,
    totalPaid: 0,
    overpaymentReturned: 0,
    status: "PENDING",
  });

  const session = await connection.startSession();
  try {
    await session.withTransaction(async () => {
      await Payable.updateOne(
        { _id: payable._id },
        { $set: { totalPaid: 40_000, status: "PARTIALLY_SETTLED" } },
        { session },
      );
      await Ledger.create([{
        sellerPayableId: payable._id,
        orderId,
        sellerId,
        entryType: "SELLER_PAYMENT",
        amount: 40_000,
        reason: "Test payment",
        occurredAt: new Date(),
        recordedBy: actorId,
        idempotencyKey: `integration-${randomUUID()}`,
      }], { session });
    });
  } finally {
    await session.endSession();
  }

  const stored = await Payable.findById(payable._id).lean();
  assert.equal(stored.totalPaid, 40_000);
  assert.equal(stored.payableAmount, 100_000);
  assert.equal(await Ledger.countDocuments({ sellerPayableId: payable._id }), 1);
});

test("append-only ledger allows bulk inserts but rejects bulk modifications", async () => {
  const payableId = new mongoose.Types.ObjectId();
  await Ledger.bulkWrite([{ insertOne: { document: {
    sellerPayableId: payableId,
    orderId: new mongoose.Types.ObjectId(),
    sellerId: new mongoose.Types.ObjectId(),
    entryType: "SELLER_PAYMENT",
    amount: 100,
    reason: "Test payment",
    occurredAt: new Date(),
    recordedBy: new mongoose.Types.ObjectId(),
    idempotencyKey: `integration-${randomUUID()}`,
  } } }]);
  await assert.rejects(
    () => Ledger.bulkWrite([{ deleteOne: { filter: { sellerPayableId: payableId } } }]),
    /append-only/i,
  );
  assert.equal(await Ledger.countDocuments({ sellerPayableId: payableId }), 1);
});

test("isolated MongoDB rolls back payable changes when ledger creation fails", async () => {
  const orderId = new mongoose.Types.ObjectId();
  const sellerId = new mongoose.Types.ObjectId();
  const payable = await Payable.create({
    orderId,
    sellerId,
    sellerSubtotal: 105_500,
    transactionFee: 5_500,
    payableAmount: 100_000,
    totalPaid: 0,
    overpaymentReturned: 0,
    status: "PENDING",
  });

  const session = await connection.startSession();
  try {
    await assert.rejects(() => session.withTransaction(async () => {
      await Payable.updateOne(
        { _id: payable._id },
        { $set: { totalPaid: 40_000, status: "PARTIALLY_SETTLED" } },
        { session },
      );
      await Ledger.create([{
        sellerPayableId: payable._id,
        orderId,
        sellerId,
        entryType: "SELLER_PAYMENT",
        amount: 0,
        reason: "Test payment",
        occurredAt: new Date(),
        recordedBy: new mongoose.Types.ObjectId(),
        idempotencyKey: `integration-${randomUUID()}`,
      }], { session });
    }), (error) => error instanceof mongoose.Error.ValidationError && Boolean(error.errors.amount));
  } finally {
    await session.endSession();
  }

  const stored = await Payable.findById(payable._id).lean();
  assert.equal(stored.totalPaid, 0);
  assert.equal(stored.status, "PENDING");
  assert.equal(await Ledger.countDocuments({ sellerPayableId: payable._id }), 0);
});

test("duplicate ledger idempotency key rolls back a second payment", async () => {
  const orderId = new mongoose.Types.ObjectId();
  const sellerId = new mongoose.Types.ObjectId();
  const payable = await Payable.create({
    orderId,
    sellerId,
    sellerSubtotal: 105_500,
    transactionFee: 5_500,
    payableAmount: 100_000,
    totalPaid: 0,
    overpaymentReturned: 0,
    status: "PENDING",
  });
  const entry = {
    sellerPayableId: payable._id,
    orderId,
    sellerId,
    entryType: "SELLER_PAYMENT",
    amount: 40_000,
    reason: "Test payment",
    occurredAt: new Date(),
    recordedBy: new mongoose.Types.ObjectId(),
    idempotencyKey: `integration-${randomUUID()}`,
  };
  await Ledger.create(entry);

  const session = await connection.startSession();
  try {
    await assert.rejects(() => session.withTransaction(async () => {
      await Payable.updateOne(
        { _id: payable._id },
        { $set: { totalPaid: 40_000, status: "PARTIALLY_SETTLED" } },
        { session },
      );
      await Ledger.create([entry], { session });
    }), (error) => error?.code === 11000);
  } finally {
    await session.endSession();
  }

  const stored = await Payable.findById(payable._id).lean();
  assert.equal(stored.totalPaid, 0);
  assert.equal(await Ledger.countDocuments({ sellerPayableId: payable._id }), 1);
});

test("one order cannot have duplicate buyer refund entitlements", async () => {
  const entitlement = {
    orderId: new mongoose.Types.ObjectId(),
    buyerId: new mongoose.Types.ObjectId(),
    productAmount: 100_000,
    sourceKey: `integration-${randomUUID()}`,
  };
  await Entitlement.create(entitlement);
  await assert.rejects(
    () => Entitlement.create({ ...entitlement, sourceKey: `integration-${randomUUID()}` }),
    (error) => error?.code === 11000,
  );
});

test("verification event and snapshot roll back together on duplicate snapshot ordinal", async () => {
  const eventId = new mongoose.Types.ObjectId();
  const session = await connection.startSession();
  try {
    await assert.rejects(() => session.withTransaction(async () => {
      await Verification.create([{
        _id: eventId,
        subjectType: "LEDGER_ENTRY",
        subjectId: new mongoose.Types.ObjectId(),
        action: "APPROVE",
        previousStatus: "UNVERIFIED",
        resultingStatus: "VERIFIED",
        decisionRevision: 1,
        snapshotVersion: 1,
        snapshotHash: "a".repeat(64),
        snapshotItemCount: 2,
        actorType: "ADMIN",
        actorId: new mongoose.Types.ObjectId(),
        reason: "Reviewed",
        occurredAt: new Date(),
        idempotencyKey: `integration-${randomUUID()}`,
        requestHash: "b".repeat(64),
      }], { session });
      const item = {
        eventId,
        ordinal: 0,
        recordType: "LEDGER_ENTRY",
        recordId: new mongoose.Types.ObjectId(),
        canonicalEjson: "{}",
      };
      await SnapshotItem.create([item], { session });
      await SnapshotItem.create([item], { session });
    }), (error) => error?.code === 11000);
  } finally {
    await session.endSession();
  }
  assert.equal(await Verification.countDocuments({ _id: eventId }), 0);
  assert.equal(await SnapshotItem.countDocuments({ eventId }), 0);
});

test("settlement mutation invalidates only verified subjects and leaves ledger verification intact", async () => {
  const payable = await SellerPayable.create({
    orderId: new mongoose.Types.ObjectId(),
    sellerId: new mongoose.Types.ObjectId(),
    sellerSubtotal: 105_500,
    transactionFee: 5_500,
    payableAmount: 100_000,
    totalPaid: 0,
    overpaymentReturned: 0,
    status: "PENDING",
    verification: {
      status: "VERIFIED",
      dataRevision: 3,
      decisionRevision: 1,
      lastEventId: new mongoose.Types.ObjectId(),
      verifiedDataRevision: 3,
      verifiedSnapshotHash: "a".repeat(64),
    },
  });
  const LedgerState = (await import("../src/models/LedgerEntryVerificationState.ts")).default;
  const entryId = new mongoose.Types.ObjectId();
  await LedgerState.create({
    ledgerEntryId: entryId,
    status: "VERIFIED",
    decisionRevision: 1,
    lastEventId: new mongoose.Types.ObjectId(),
    verifiedSnapshotHash: "b".repeat(64),
  });
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(() => recordSettlementMutation({
      session,
      payableIds: [payable._id, payable._id],
      reason: "Payment recorded",
    }));
    await assert.rejects(() => session.withTransaction(async () => {
      await recordSettlementMutation({ session, payableIds: [payable._id], reason: "Rolled back" });
      throw new Error("force rollback");
    }), /force rollback/);
  } finally {
    await session.endSession();
  }
  const updated = await SellerPayable.findById(payable._id).lean();
  assert.equal(updated.verification.status, "REQUIRES_REVIEW");
  assert.equal(updated.verification.reviewReason, "DATA_CHANGED");
  assert.equal(updated.verification.dataRevision, 4);
  assert.equal(updated.verification.decisionRevision, 2);
  assert.equal(await SettlementVerification.countDocuments({ subjectId: payable._id }), 1);
  assert.equal((await LedgerState.findOne({ ledgerEntryId: entryId }).lean()).status, "VERIFIED");
  assert.equal(await SettlementFinancialHold.countDocuments({ subjectId: payable._id }), 0);
});

test("mutation initializes missing metadata but rejects malformed historical metadata", async () => {
  const payable = await SellerPayable.create({
    orderId: new mongoose.Types.ObjectId(),
    sellerId: new mongoose.Types.ObjectId(),
    sellerSubtotal: 105_500,
    transactionFee: 5_500,
    payableAmount: 100_000,
    status: "PENDING",
  });

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(() => recordSettlementMutation({
      session, payableIds: [payable._id], reason: "Payment recorded",
    }));
    const stored = await SellerPayable.collection.findOne({ _id: payable._id });
    assert.deepEqual(stored.verification, { status: "UNVERIFIED", dataRevision: 1, decisionRevision: 0 });
    await SellerPayable.collection.updateOne({ _id: payable._id }, { $set: { verification: null } });
    await assert.rejects(
      () => session.withTransaction(() => recordSettlementMutation({
        session, payableIds: [payable._id], reason: "Payment recorded",
      })),
      /Malformed settlement verification metadata/,
    );
    assert.equal((await SellerPayable.collection.findOne({ _id: payable._id })).verification, null);
  } finally {
    await session.endSession();
  }
});

  test("reconciliation snapshots include recovery, embedded entry and ledger without invalidating old entry snapshots", async () => {
    const orderId = new mongoose.Types.ObjectId();
    const sellerId = new mongoose.Types.ObjectId();
    const payable = await SellerPayable.create({
      orderId, sellerId, sellerSubtotal: 105_500, transactionFee: 5_500,
      payableAmount: 100_000, totalPaid: 50_000, overpaymentReturned: 0, status: "CANCELLED",
    });
    const actor = new mongoose.Types.ObjectId();
    const recovery = await SellerRecovery.create({
      orderId, sellerId, payableId: payable._id, refundId: new mongoose.Types.ObjectId(),
      settledAmount: 50_000, amountDue: 50_000, amountRecovered: 20_000,
      status: "OUTSTANDING", entries: [{ amount: 20_000, recordedBy: actor }],
    });
    const entry = await SellerSettlementLedger.create({
      sellerPayableId: payable._id, sellerRecoveryId: recovery._id, orderId, sellerId,
      entryType: "REFUND_RECOVERY", amount: 20_000, reason: "Recovery",
      occurredAt: new Date(), recordedBy: actor, idempotencyKey: `integration-${randomUUID()}`,
    });
    const session = await mongoose.startSession();
    const read = (subjectType, subjectId) => session.withTransaction(() =>
      readSettlementSnapshot({ subjectType, subjectId, session }));
    try {
      const first = await read("PAYABLE_RECONCILIATION", payable._id);
      assert.deepEqual(first.items.map((item) => item.recordType).sort(), [
        "LEDGER_ENTRY", "PAYABLE", "RECOVERY", "RECOVERY_ENTRY",
      ]);
      const oldEntry = await read("LEDGER_ENTRY", entry._id);
      await SellerSettlementLedger.create({
        sellerPayableId: payable._id, orderId, sellerId, entryType: "SELLER_PAYMENT",
        amount: 1, reason: "Another entry", occurredAt: new Date(), recordedBy: actor,
        idempotencyKey: `integration-${randomUUID()}`,
      });
      assert.notEqual((await read("PAYABLE_RECONCILIATION", payable._id)).hash, first.hash);
      assert.equal((await read("LEDGER_ENTRY", entry._id)).hash, oldEntry.hash);
      await SellerPayable.collection.updateOne({ _id: payable._id }, {
        $set: { verification: { status: "UNVERIFIED", dataRevision: 7, decisionRevision: 0 }, updatedAt: new Date() },
      });
      const withMetadata = await read("PAYABLE_RECONCILIATION", payable._id);
      await SellerPayable.collection.updateOne({ _id: payable._id }, {
        $set: { "verification.dataRevision": 8, updatedAt: new Date() },
      });
      assert.equal((await read("PAYABLE_RECONCILIATION", payable._id)).hash, withMetadata.hash);
      await SettlementActorResolution.create({
        ledgerEntryId: entry._id,
        identifiedActorId: actor,
        investigatedBy: new mongoose.Types.ObjectId(),
        evidenceIds: [new mongoose.Types.ObjectId()],
        reason: "Historical actor investigation",
        occurredAt: new Date(),
        idempotencyKey: `integration-${randomUUID()}`,
        requestHash: "a".repeat(64),
      });
      const resolvedEntry = await read("LEDGER_ENTRY", entry._id);
      assert.notEqual(resolvedEntry.hash, oldEntry.hash);
      assert.equal(resolvedEntry.items.filter((item) => item.recordType === "ACTOR_RESOLUTION").length, 1);
      assert.notEqual((await read("PAYABLE_RECONCILIATION", payable._id)).hash, withMetadata.hash);
    } finally {
      await session.endSession();
    }
  });

  test("snapshot rejects ledger references that conflict with its payable", async () => {
    const orderId = new mongoose.Types.ObjectId();
    const sellerId = new mongoose.Types.ObjectId();
    const payable = await SellerPayable.create({
      orderId, sellerId, sellerSubtotal: 105_500, transactionFee: 5_500,
      payableAmount: 100_000, status: "PENDING",
    });
    await SellerSettlementLedger.create({
      sellerPayableId: payable._id, orderId: new mongoose.Types.ObjectId(), sellerId,
      entryType: "SELLER_PAYMENT", amount: 1, reason: "Inconsistent record",
      occurredAt: new Date(), recordedBy: new mongoose.Types.ObjectId(),
      idempotencyKey: `integration-${randomUUID()}`,
    });
    const session = await mongoose.startSession();
    try {
      await assert.rejects(() => session.withTransaction(() => readSettlementSnapshot({
        subjectType: "PAYABLE_RECONCILIATION", subjectId: payable._id, session,
      })), /ownership does not match/);
    } finally {
      await session.endSession();
    }
  });

test("resolving one hold and creating its audit event leaves other holds active", async () => {
  const subjectId = new mongoose.Types.ObjectId();
  const data = {
    subjectType: "PAYABLE",
    subjectId,
    reason: "INTEGRITY_MISMATCH",
    description: "Investigate transaction",
  };
  const [first, second] = await Hold.create([data, data]);
  const adminId = new mongoose.Types.ObjectId();
  const evidenceId = new mongoose.Types.ObjectId();
  const session = await connection.startSession();
  try {
    await session.withTransaction(async () => {
      first.status = "RESOLVED";
      first.resolvedBy = adminId;
      first.resolvedAt = new Date();
      first.resolutionReason = "Issue resolved";
      first.resolutionEvidenceIds = [evidenceId];
      await first.save({ session });
      await ControlEvent.create([{
        holdId: first._id,
        action: "RESOLVED",
        actorType: "ADMIN",
        actorId: adminId,
        reason: "Issue resolved",
        evidenceIds: [evidenceId],
        occurredAt: new Date(),
      }], { session });
    });

  } finally {
    await session.endSession();
  }
  assert.equal((await Hold.findById(second._id).lean()).status, "ACTIVE");
  assert.equal(await ControlEvent.countDocuments({ holdId: first._id }), 1);
});

test("competing mutation transactions retry against the latest verification revision", async () => {
  const payable = await SellerPayable.create({
    orderId: new mongoose.Types.ObjectId(), sellerId: new mongoose.Types.ObjectId(),
    sellerSubtotal: 105_500, transactionFee: 5_500, payableAmount: 100_000, status: "PENDING",
    verification: { status: "UNVERIFIED", dataRevision: 0, decisionRevision: 0 },
  });
  const first = await mongoose.startSession();
  const second = await mongoose.startSession();
  try {
    first.startTransaction();
    second.startTransaction();
    await recordSettlementMutation({ session: first, payableIds: [payable._id], reason: "First" });
    const contested = recordSettlementMutation({ session: second, payableIds: [payable._id], reason: "Second" })
      .then(() => null, (error) => error);
    await new Promise((resolve) => setTimeout(resolve, 100));
    await first.commitTransaction();
    const error = await contested;
    assert.ok(error instanceof Error);
    assert.equal(error.hasErrorLabel?.("TransientTransactionError"), true);
    await second.abortTransaction();
    await second.withTransaction(() => recordSettlementMutation({
      session: second, payableIds: [payable._id], reason: "Second",
    }));
    assert.equal((await SellerPayable.findById(payable._id).lean()).verification.dataRevision, 2);
  } finally {
    if (first.inTransaction()) await first.abortTransaction();
    if (second.inTransaction()) await second.abortTransaction();
    await first.endSession();
    await second.endSession();
  }
});

test("hold creation is fenced, audited atomically, and rejects conflicting replays", async () => {
  const orderId = new mongoose.Types.ObjectId();
  const payable = await SellerPayable.create({
    orderId, sellerId: new mongoose.Types.ObjectId(), sellerSubtotal: 105_500,
    transactionFee: 5_500, payableAmount: 100_000, status: "PENDING",
  });

  const holdId = new mongoose.Types.ObjectId();
  const session = await mongoose.startSession();
  const input = {
    holdId, orderId, subjectType: "PAYABLE", subjectId: payable._id,
    reason: "UNRESOLVED_AMOUNT_PROVENANCE", description: "Investigate payment provenance",
    actor: { type: "SYSTEM" }, session,
  };
  try {
    await session.withTransaction(() => createSettlementFinancialHold(input));
    await session.withTransaction(() => createSettlementFinancialHold(input));
    await assert.rejects(() => session.withTransaction(() => createSettlementFinancialHold({
      ...input, description: "Different reason",
    })), /conflicts/);
    const rolledBackId = new mongoose.Types.ObjectId();
    await assert.rejects(() => session.withTransaction(async () => {
      await createSettlementFinancialHold({ ...input, holdId: rolledBackId });
      throw new Error("force rollback");
    }), /force rollback/);
    assert.equal(await SettlementFinancialHold.countDocuments({ _id: holdId, status: "ACTIVE" }), 1);
    assert.equal(await SettlementFinancialControlEvent.countDocuments({ holdId }), 1);
    assert.equal(await SettlementFinancialHold.countDocuments({ _id: rolledBackId }), 0);
    assert.equal(await SettlementFinancialControlEvent.countDocuments({ holdId: rolledBackId }), 0);
  } finally {
    await session.endSession();
  }
});

test("completed order creates a fenced, revisioned payable without duplicating it on retry", async () => {
  const sellerId = new mongoose.Types.ObjectId();
  const order = await Order.create({
    buyerId: new mongoose.Types.ObjectId(),
    items: [{ productId: new mongoose.Types.ObjectId(), sellerId, name: "Item", price: 105_500 }],
    subtotal: 105_500,
    totalAmount: 108_665,
    deliveryMethod: "pickup",
    status: "COMPLETED",
    expiresAt: new Date(Date.now() + 60_000),
  });
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(() => createSellerPayablesForCompletedOrder(order, session));
    const payable = await SellerPayable.findOne({ orderId: order._id, sellerId }).lean();
    assert.equal(payable.payableAmount, 100_000);
    assert.equal(payable.verification.status, "UNVERIFIED");
    assert.equal(payable.verification.dataRevision, 1);
    assert.equal((await SettlementOrderFence.findById(order._id).lean()).revision, 1);
    await session.withTransaction(() => createSellerPayablesForCompletedOrder(order, session));
    assert.equal(await SellerPayable.countDocuments({ orderId: order._id, sellerId }), 1);
    assert.equal((await SellerPayable.findById(payable._id).lean()).verification.dataRevision, 1);
  } finally {
    await session.endSession();
  }
});

test("admin refund remains pending despite ambiguous seller, then issues once after reserve funding", async () => {
  const sellerId = new mongoose.Types.ObjectId();
  const buyerId = new mongoose.Types.ObjectId();
  const productId = new mongoose.Types.ObjectId();
  const order = await Order.create({
    buyerId, items: [{ productId, sellerId, name: "Item", price: 100_000 }],
    subtotal: 100_000, totalAmount: 103_000, deliveryMethod: "pickup",
    status: "COMPLETED", expiresAt: new Date(Date.now() + 60_000),
  });
  const payable = await SellerPayable.create({
    orderId: order._id, sellerId, sellerSubtotal: 100_000, transactionFee: 5_500,
    payableAmount: 94_500, status: "SETTLED",
  });
  const refund = await Refund.create({
    orderId: order._id, userId: buyerId, reason: "OTHER", description: "Test refund",
  });
  const approved = await approveRefund(refund._id.toString(), new mongoose.Types.ObjectId().toString());
  assert.equal(approved.status, "PROCESSING");
  assert.equal((await BuyerRefundEntitlement.findOne({ orderId: order._id }).lean()).status, "GP_PENDING");
  const resolution = await SellerFinancialResolution.findOne({ orderId: order._id }).lean();
  assert.equal(resolution.status, "PENDING");
  assert.equal(await processSellerFinancialResolution(resolution._id), "ON_HOLD");
  assert.equal(await processSellerFinancialResolution(resolution._id), "ON_HOLD");
  assert.equal(await SellerRecovery.countDocuments({ payableId: payable._id }), 0);
  assert.equal(await SettlementFinancialHold.countDocuments({ subjectId: payable._id, status: "ACTIVE" }), 1);
  assert.equal((await SellerPayable.findById(payable._id).lean()).status, "SETTLED");
  assert.equal(await GreenPointLedger.countDocuments({ referenceKey: `refund:${refund._id}:product:gp` }), 0);
  assert.equal((await Order.findById(order._id).lean()).status, "COMPLETED");
  await topUpGreenPointReserve({
    amount: 1_000_000, referenceKey: `integration-${randomUUID()}`,
    actorId: new mongoose.Types.ObjectId().toString(),
  });
  assert.equal((await BuyerRefundEntitlement.findOne({ orderId: order._id }).lean()).status, "GP_ISSUED");
  assert.equal((await Refund.findById(refund._id).lean()).status, "COMPLETED");
  assert.equal(await GreenPointLedger.countDocuments({ referenceKey: `refund:${refund._id}:product:gp` }), 1);
  assert.equal(await approveRefund(refund._id.toString(), new mongoose.Types.ObjectId().toString()), null);
  const session = await mongoose.startSession();
  try {
    const qcRefund = await session.withTransaction(() => createQcCompensation({
      orderId: order._id.toString(), userId: buyerId.toString(), productId: productId.toString(), session,
    }));
    assert.equal(qcRefund._id.toString(), refund._id.toString());
    assert.equal(await GreenPointLedger.countDocuments({ referenceKey: `refund:${refund._id}:product:gp` }), 1);
  } finally {
    await session.endSession();
  }
});

test("concurrent admin and QC refund paths create at most one buyer entitlement and GP credit", async () => {
    const buyerId = new mongoose.Types.ObjectId();
    const sellerId = new mongoose.Types.ObjectId();
    const productId = new mongoose.Types.ObjectId();
    const order = await Order.create({
      buyerId, items: [{ productId, sellerId, name: "Item", price: 105_500 }],
      subtotal: 105_500, totalAmount: 108_665, deliveryMethod: "pickup",
      status: "PAID", expiresAt: new Date(Date.now() + 60_000),
    });
    const refund = await Refund.create({
      orderId: order._id, userId: buyerId, reason: "OTHER", description: "Test refund",
    });
    const results = await Promise.allSettled([
      approveRefund(refund._id.toString(), new mongoose.Types.ObjectId().toString()),
      createQcCompensation({ orderId: order._id.toString(), userId: buyerId.toString(), productId: productId.toString() }),
    ]);
    assert.ok(results.some((result) => result.status === "fulfilled" && result.value));
    assert.equal(await BuyerRefundEntitlement.countDocuments({ orderId: order._id }), 1);
    assert.equal(await SellerFinancialResolution.countDocuments({ orderId: order._id }), 1);
    assert.equal(await PendingGreenPointCredit.countDocuments({ orderId: order._id, source: "REFUND" }), 1);
    assert.ok(await GreenPointLedger.countDocuments({ userId: buyerId, type: "REFUND" }) <= 1);
  });

test("seller worker holds a payable with an orphaned recovery ledger entry", async () => {
    const buyerId = new mongoose.Types.ObjectId();
    const sellerId = new mongoose.Types.ObjectId();
    const order = await Order.create({
      buyerId, items: [{ productId: new mongoose.Types.ObjectId(), sellerId, name: "Item", price: 105_500 }],
      subtotal: 105_500, totalAmount: 108_665, deliveryMethod: "pickup",
      status: "COMPLETED", expiresAt: new Date(Date.now() + 60_000),
    });
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(() => createSellerPayablesForCompletedOrder(order, session));
      const payable = await SellerPayable.findOne({ orderId: order._id }).lean();
      await SellerSettlementLedger.create({
        sellerPayableId: payable._id, sellerRecoveryId: new mongoose.Types.ObjectId(),
        orderId: order._id, sellerId, entryType: "REFUND_RECOVERY", amount: 1,
        reason: "Orphaned entry", occurredAt: new Date(), recordedBy: new mongoose.Types.ObjectId(),
        idempotencyKey: `integration-${randomUUID()}`,
      });
      const refund = await Refund.create({
        orderId: order._id, userId: buyerId, reason: "OTHER", description: "Test refund",
      });
      await approveRefund(refund._id.toString(), new mongoose.Types.ObjectId().toString());
      const resolution = await SellerFinancialResolution.findOne({ orderId: order._id }).lean();
      assert.equal(await processSellerFinancialResolution(resolution._id), "ON_HOLD");
      assert.equal(await SellerRecovery.countDocuments({ payableId: payable._id }), 0);
      assert.equal((await SettlementFinancialHold.findOne({ subjectId: payable._id }).lean()).reason, "INTEGRITY_MISMATCH");
    } finally {
      await session.endSession();
    }
  });
test("deadline refund reuse does not issue duplicate GP", async () => {
    const buyerId = new mongoose.Types.ObjectId();
    const sellerId = new mongoose.Types.ObjectId();
    const order = await Order.create({
      buyerId, items: [{ productId: new mongoose.Types.ObjectId(), sellerId, name: "Item", price: 105_500 }],
      subtotal: 105_500, totalAmount: 108_665, deliveryMethod: "pickup",
      status: "CANCELLED", expiresAt: new Date(Date.now() + 60_000),
    });

    const session = await mongoose.startSession();
    try {
      const first = await session.withTransaction(() => createHandoverDeadlineRefund({ orderId: order._id, session }));
      const second = await session.withTransaction(() => createHandoverDeadlineRefund({ orderId: order._id, session }));
      assert.equal(first._id.toString(), second._id.toString());
      assert.equal(await BuyerRefundEntitlement.countDocuments({ orderId: order._id }), 1);
      assert.equal(await SellerFinancialResolution.countDocuments({ orderId: order._id }), 1);
      assert.equal(await PendingGreenPointCredit.countDocuments({ orderId: order._id, source: "REFUND" }), 1);
      assert.ok(await GreenPointLedger.countDocuments({ userId: buyerId, type: "REFUND" }) <= 1);
    } finally {
      await session.endSession();
    }
  });

test("seller worker creates recovery only from ledger-backed payment and retries idempotently", async () => {
  const sellerId = new mongoose.Types.ObjectId();
  const buyerId = new mongoose.Types.ObjectId();
  const order = await Order.create({
    buyerId, items: [{ productId: new mongoose.Types.ObjectId(), sellerId, name: "Item", price: 105_500 }],
    subtotal: 105_500, totalAmount: 108_665, deliveryMethod: "pickup",
    status: "COMPLETED", expiresAt: new Date(Date.now() + 60_000),
  });
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(() => createSellerPayablesForCompletedOrder(order, session));
    const payable = await SellerPayable.findOne({ orderId: order._id, sellerId });
    await session.withTransaction(async () => {
      await SellerPayable.updateOne({ _id: payable._id }, { $set: { totalPaid: 40_000, status: "PARTIALLY_SETTLED" } }, { session });
      await SellerSettlementLedger.create([{
        sellerPayableId: payable._id, orderId: order._id, sellerId,
        entryType: "SELLER_PAYMENT", amount: 40_000, reason: "Recorded payment",
        occurredAt: new Date(), recordedBy: new mongoose.Types.ObjectId(),
        idempotencyKey: `integration-${randomUUID()}`,
      }], { session });
      await recordSettlementMutation({ session, payableIds: [payable._id], reason: "Payment recorded" });
    });
    const refund = await Refund.create({
      orderId: order._id, userId: buyerId, reason: "OTHER", description: "Test refund",
    });
    await approveRefund(refund._id.toString(), new mongoose.Types.ObjectId().toString());
    const resolution = await SellerFinancialResolution.findOne({ orderId: order._id }).lean();
    assert.equal(await processSellerFinancialResolution(resolution._id), "RESOLVED");
    assert.equal(await processSellerFinancialResolution(resolution._id), "RESOLVED");
    const recoveries = await SellerRecovery.find({ payableId: payable._id }).lean();
    assert.equal(recoveries.length, 1);
    assert.equal(recoveries[0].amountDue, 40_000);
    assert.equal((await SellerPayable.findById(payable._id).lean()).status, "CANCELLED");
    assert.equal(recoveries[0].verification.dataRevision, 1);
  } finally {
    await session.endSession();
  }
});

test("resolution queue applies pagination, filters, and authorization response", async () => {
  const orderId = new mongoose.Types.ObjectId();
  for (let i = 0; i < 2; i++) {
    await SellerFinancialResolution.create({
      orderId, entitlementId: new mongoose.Types.ObjectId(), status: "PENDING",
    });
  }
  const response = await getResolutionQueue(new Request(`http://localhost/api/admin/seller-financial-resolutions?search=${orderId}&status=PENDING&pageSize=1`));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.items.length, 1);
  assert.equal(body.data.pagination.total, 2);
  assert.equal(body.data.pagination.totalPages, 2);
  assert.equal((await getResolutionQueue(new Request("http://localhost/api/admin/seller-financial-resolutions?status=bad"))).status, 400);
  const previous = globalThis.__settlementTestAuth;
  try {
    globalThis.__settlementTestAuth = { success: false, response: new Response(null, { status: 403 }) };
    assert.equal((await getResolutionQueue(new Request("http://localhost/api/admin/seller-financial-resolutions"))).status, 403);
  } finally {
    globalThis.__settlementTestAuth = previous;
  }
});

test("settlement listing does not infer a missing historical payment", async () => {
  const payableId = new mongoose.Types.ObjectId();
  await SellerPayable.collection.insertOne({
    _id: payableId, orderId: new mongoose.Types.ObjectId(), sellerId: new mongoose.Types.ObjectId(),
    sellerSubtotal: 105_500, transactionFee: 5_500, payableAmount: 100_000, status: "SETTLED",
  });
  const response = await getSettlements(new Request(`http://localhost/api/admin/settlements?search=${payableId}`));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.payables.length, 1);
  assert.equal(body.data.payables[0].totalPaid, null);
  assert.equal(body.data.payables[0].overpaymentReturned, null);
  assert.equal(body.data.payables[0].outstandingPayable, null);
  assert.equal(body.data.payables[0].financialProvenance, "REQUIRES_REVIEW");
  assert.equal(body.data.payables[0].status, "SETTLED");
});

test("refund races with actual buyer QC decision endpoint", async () => {
  const buyerId = new mongoose.Types.ObjectId();
  const sellerId = new mongoose.Types.ObjectId();
  const productId = new mongoose.Types.ObjectId();
  const order = await Order.create({
    buyerId, items: [{ productId, sellerId, name: "Item", price: 105_500,
      qcStatus: "FAILED_AWAITING_BUYER", qcDecisionDeadline: new Date(Date.now() + 60_000) }],
    subtotal: 105_500, totalAmount: 108_665, deliveryMethod: "pickup",
    status: "AWAITING_BUYER_CONFIRMATION", expiresAt: new Date(Date.now() + 60_000),
  });
  const refund = await Refund.create({ orderId: order._id, userId: buyerId, reason: "OTHER", description: "Test refund" });
  const previousAuth = globalThis.__settlementTestAuth;
  globalThis.__settlementTestAuth = { success: true, user: { id: buyerId.toString(), role: "USER" } };
  const blocker = await mongoose.startSession();
  try {
    blocker.startTransaction();
    await touchSettlementOrderFence(order._id, blocker);
    const request = new Request("http://localhost/api/orders/qc-decision", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ productId: productId.toString(), decision: "ACCEPT" }),
    });
    const qc = postBuyerQcDecision(request, { params: Promise.resolve({ id: order._id.toString() }) });
    const approval = approveRefund(refund._id.toString(), new mongoose.Types.ObjectId().toString());
    await new Promise((resolve) => setTimeout(resolve, 150));
    await blocker.commitTransaction();
    const [response, approved] = await Promise.all([qc, approval]);
    assert.ok(approved);
    assert.ok([200, 409].includes(response.status));
    assert.equal(await BuyerRefundEntitlement.countDocuments({ orderId: order._id }), 1);
    assert.equal(await PendingGreenPointCredit.countDocuments({ orderId: order._id, source: "REFUND" }), 1);
    const current = await Order.findById(order._id).lean();
    if (response.status === 409) assert.equal(current.items[0].qcStatus, "FAILED_AWAITING_BUYER");
  } finally {
    globalThis.__settlementTestAuth = previousAuth;
    if (blocker.inTransaction()) await blocker.abortTransaction();
    await blocker.endSession();
  }
});

test("seller worker bounds retries and does not retry failed or held jobs", async () => {
  const resolution = await SellerFinancialResolution.create({
    orderId: new mongoose.Types.ObjectId(), entitlementId: new mongoose.Types.ObjectId(), status: "PENDING",
  });
  const concurrent = await Promise.all([
    recordSellerResolutionFailure(resolution._id),
    recordSellerResolutionFailure(resolution._id),
  ]);
  assert.deepEqual(concurrent, ["PENDING", "PENDING"]);
  let updated = await SellerFinancialResolution.findById(resolution._id).lean();
  assert.equal(updated.failedAttempts, 1);
  assert.ok(updated.nextAttemptAt > new Date());
  for (let attempt = 2; attempt <= 5; attempt++) {
    await SellerFinancialResolution.updateOne({ _id: resolution._id }, { $set: { nextAttemptAt: new Date(0) } });
    await recordSellerResolutionFailure(resolution._id);
  }
  updated = await SellerFinancialResolution.findById(resolution._id).lean();
  assert.equal(updated.failedAttempts, 5);
  assert.equal(updated.status, "FAILED_REQUIRES_ATTENTION");
  assert.equal(await processSellerFinancialResolution(resolution._id), "FAILED_REQUIRES_ATTENTION");
  await SellerFinancialResolution.updateOne({ _id: resolution._id }, { $set: { status: "ON_HOLD" } });
  assert.equal(await processSellerFinancialResolution(resolution._id), "ON_HOLD");
});

test("two workers resolve the same pending job only once", async () => {
  const orderId = new mongoose.Types.ObjectId();
  const buyerId = new mongoose.Types.ObjectId();
  const refund = await Refund.create({ orderId, userId: buyerId, reason: "OTHER", description: "Test refund" });
  const entitlement = await BuyerRefundEntitlement.create({
    orderId, buyerId, refundId: refund._id, productAmount: 100_000,
    sourceKey: `integration-${randomUUID()}`, status: "GP_PENDING",
  });
  const resolution = await SellerFinancialResolution.create({
    orderId, entitlementId: entitlement._id, status: "PENDING",
  });
  const result = await Promise.all([
    processSellerFinancialResolution(resolution._id),
    processSellerFinancialResolution(resolution._id),
  ]);
  assert.deepEqual(result, ["RESOLVED", "RESOLVED"]);
  assert.equal((await SellerFinancialResolution.findById(resolution._id).lean()).revision, 1);
});

for (const action of ["PAYMENT", "OVERPAYMENT_RETURN", "RECOVER"]) {
  test(`refund races with actual settlement ${action} endpoint`, async () => {
    const buyerId = new mongoose.Types.ObjectId();
    const sellerId = new mongoose.Types.ObjectId();
    const order = await Order.create({
      buyerId, items: [{ productId: new mongoose.Types.ObjectId(), sellerId, name: "Item", price: 105_500 }],
      subtotal: 105_500, totalAmount: 108_665, deliveryMethod: "pickup",
      status: "COMPLETED", expiresAt: new Date(Date.now() + 60_000),
    });
    const priorPaid = action === "PAYMENT" ? 0 : action === "OVERPAYMENT_RETURN" ? 110_000 : 40_000;
    const payable = await SellerPayable.create({
      orderId: order._id, sellerId, sellerSubtotal: 105_500, transactionFee: 5_500,
      payableAmount: 100_000, totalPaid: priorPaid, overpaymentReturned: 0,
      ledgerBaseline: "ZERO_AT_CREATION",
      status: action === "PAYMENT" ? "PENDING" : action === "OVERPAYMENT_RETURN" ? "OVERPAID" : "CANCELLED",
    });
    if (priorPaid) {
      await SellerSettlementLedger.create({
        sellerPayableId: payable._id, orderId: order._id, sellerId,
        entryType: "SELLER_PAYMENT", amount: priorPaid, reason: "Prior transfer",
        occurredAt: new Date(), recordedBy: new mongoose.Types.ObjectId(),
        idempotencyKey: `integration-${randomUUID()}`,
      });
    }

    let subjectId = payable._id;
    if (action === "RECOVER") {
      const recovery = await SellerRecovery.create({
        orderId: order._id, sellerId, payableId: payable._id, refundId: new mongoose.Types.ObjectId(),
        settledAmount: 40_000, amountDue: 40_000, amountRecovered: 0, status: "OUTSTANDING", entries: [],
      });
      subjectId = recovery._id;
    }
    const refund = await Refund.create({ orderId: order._id, userId: buyerId, reason: "OTHER", description: "Test refund" });
    const key = `integration-${randomUUID()}`;
    const body = {
      action, id: subjectId.toString(), amount: 5_000, reason: "Actual transfer recorded",
      occurredAt: new Date().toISOString(), idempotencyKey: key,
      confirmedPaid: true, confirmedReceived: true,
    };
    const request = () => new Request("http://localhost/api/admin/settlements", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    const blocker = await mongoose.startSession();
    try {
      blocker.startTransaction();
      await touchSettlementOrderFence(order._id, blocker);
      const settlementResult = postSettlement(request());
      const refundResult = approveRefund(refund._id.toString(), new mongoose.Types.ObjectId().toString());
      await new Promise((resolve) => setTimeout(resolve, 150));
      await blocker.commitTransaction();
      const [response, approved] = await Promise.all([settlementResult, refundResult]);
      assert.ok(approved);
      assert.ok(action === "PAYMENT" ? [200, 409].includes(response.status) : response.status === 200);
      assert.equal(await BuyerRefundEntitlement.countDocuments({ orderId: order._id }), 1);
      assert.equal(await SellerFinancialResolution.countDocuments({ orderId: order._id }), 1);
      assert.equal(await PendingGreenPointCredit.countDocuments({ orderId: order._id, source: "REFUND" }), 1);
      assert.equal(await SellerSettlementLedger.countDocuments({ idempotencyKey: key }), response.status === 200 ? 1 : 0);
      if (response.status === 200) {
        assert.equal((await postSettlement(request())).status, 200);
        assert.equal(await SellerSettlementLedger.countDocuments({ idempotencyKey: key }), 1);
      }
      if (action === "PAYMENT") {
        const second = { ...body, idempotencyKey: `integration-${randomUUID()}` };
        const blocked = await postSettlement(new Request("http://localhost/api/admin/settlements", {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(second),
        }));
        assert.equal(blocked.status, 409);
      }
    } finally {
      if (blocker.inTransaction()) await blocker.abortTransaction();
      await blocker.endSession();
    }
  });
}
