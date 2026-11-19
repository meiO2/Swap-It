import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";
import SellerSettlementLedger from "../src/models/SellerSettlementLedger.ts";

mongoose.set("bufferCommands", false);

test("seller settlement ledger rejects model-level mutations", async () => {
  const mutations = [
    () => SellerSettlementLedger.updateOne({}, { $set: { amount: 1 } }).exec(),
    () => SellerSettlementLedger.updateMany({}, { $set: { amount: 1 } }).exec(),
    () => SellerSettlementLedger.replaceOne({}, {}).exec(),
    () => SellerSettlementLedger.findOneAndUpdate({}, { $set: { amount: 1 } }).exec(),
    () => SellerSettlementLedger.findOneAndReplace({}, {}).exec(),
    () => SellerSettlementLedger.findOneAndDelete({}).exec(),
    () => SellerSettlementLedger.deleteOne({}).exec(),
    () => SellerSettlementLedger.deleteMany({}).exec(),
    () => SellerSettlementLedger.bulkWrite([{ deleteOne: { filter: {} } }]),
    () => SellerSettlementLedger.bulkWrite([{ updateOne: { filter: {}, update: { $set: { amount: 1 } } } }]),
  ];

  for (const mutate of mutations) {
    await assert.rejects(mutate, /seller settlement ledger is append-only/i);
  }
});

test("seller settlement ledger rejects saving or deleting an existing document", async () => {
  const id = () => new mongoose.Types.ObjectId();
  const entry = new SellerSettlementLedger({
    sellerPayableId: id(),
    orderId: id(),
    sellerId: id(),
    entryType: "SELLER_PAYMENT",
    amount: 1,
    reason: "Recorded transfer",
    occurredAt: new Date(),
    recordedBy: id(),
    idempotencyKey: "test-ledger-entry",
  });
  entry.$isNew = false;

  await assert.rejects(() => entry.save(), /seller settlement ledger is append-only/i);
  await assert.rejects(() => entry.deleteOne(), /seller settlement ledger is append-only/i);
});
