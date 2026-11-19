import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";
import BuyerRefundEntitlement from "../src/models/BuyerRefundEntitlement.ts";
import SettlementFinancialHold from "../src/models/SettlementFinancialHold.ts";
import SettlementFinancialControlEvent from "../src/models/SettlementFinancialControlEvent.ts";
import SettlementEvidence from "../src/models/SettlementEvidence.ts";
import LedgerEntryVerificationState from "../src/models/LedgerEntryVerificationState.ts";
import SettlementVerification from "../src/models/SettlementVerification.ts";
import SettlementVerificationSnapshotItem from "../src/models/SettlementVerificationSnapshotItem.ts";
import SettlementIncident from "../src/models/SettlementIncident.ts";
import SellerPayable from "../src/models/SellerPayable.ts";
import { buildSettlementSnapshot, canonicalSnapshotEjson } from "../src/lib/settlement-snapshot.ts";
import {
  MAX_SETTLEMENT_EVIDENCE_BYTES,
  readSettlementEvidence,
  storeSettlementEvidence,
} from "../src/lib/settlement-evidence-storage.ts";

mongoose.set("bufferCommands", false);
const id = () => new mongoose.Types.ObjectId();

test("evidence test adapter rejects MIME mismatches, replacement and content tampering", async () => {
  const files = new Map();
  const storage = {
    async putIfAbsent(key, content) {
      if (files.has(key)) throw new Error("Object already exists.");
      files.set(key, Buffer.from(content));
    },
    async read(key) {
      if (!files.has(key)) throw new Error("Object not found.");
      return Buffer.from(files.get(key));
    },
  };
  const image = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415408d763f8cfc0f01f00050001ff89993d1d0000000049454e44ae426082", "hex");
  await assert.rejects(() => storeSettlementEvidence({
    storage, content: image, declaredMimeType: "image/jpeg", originalFileName: "receipt.jpg",
  }), /content does not match/);
  await assert.rejects(() => storeSettlementEvidence({
    storage, content: Buffer.alloc(MAX_SETTLEMENT_EVIDENCE_BYTES + 1), declaredMimeType: "image/png", originalFileName: "receipt.png",
  }), /size is invalid/);
  await assert.rejects(() => storeSettlementEvidence({
    storage, content: image, declaredMimeType: "image/png", originalFileName: "../receipt.png",
  }), /filename is invalid/);
  const metadata = await storeSettlementEvidence({
    storage, content: image, declaredMimeType: "image/png", originalFileName: "receipt.png",
  });
  assert.deepEqual(await readSettlementEvidence({ storage, ...metadata }), image);
  await assert.rejects(() => storage.putIfAbsent(metadata.storageKey, image), /already exists/);
  files.set(metadata.storageKey, Buffer.alloc(image.length));
  await assert.rejects(() => readSettlementEvidence({ storage, ...metadata }), /integrity verification failed/);
});

test("refund entitlement rejects non-integer product amounts", async () => {
  const entitlement = new BuyerRefundEntitlement({
    orderId: id(),
    buyerId: id(),
    productAmount: 10.5,
    sourceKey: "test-refund",
  });
  await assert.rejects(() => entitlement.validate(), /productAmount/);
});

test("financial hold resolution requires an actor and evidence", async () => {
  const hold = new SettlementFinancialHold({
    subjectType: "PAYABLE",
    subjectId: id(),
    reason: "UNRESOLVED_AMOUNT_PROVENANCE",
    status: "RESOLVED",
    description: "Requires investigation",
  });
  await assert.rejects(() => hold.validate(), /resolved hold requires/i);
  hold.resolvedBy = id();
  hold.resolvedAt = new Date();
  hold.resolutionReason = "Verified independently";
  hold.resolutionEvidenceIds = [id()];
  await hold.validate();
});

test("hold audit is append-only and requires an administrator for resolution", async () => {
  const event = new SettlementFinancialControlEvent({
    holdId: id(),
    action: "RESOLVED",
    actorType: "SYSTEM",
    reason: "Review",
    occurredAt: new Date(),
  });
  await assert.rejects(() => event.validate(), /requires an ADMIN and evidence/);
  await assert.rejects(
    () => SettlementFinancialControlEvent.deleteMany({}).exec(),
    /append-only/i,
  );
});

test("evidence metadata rejects invalid checksums and cannot be changed through the model", async () => {
  const evidence = new SettlementEvidence({
    storageKey: "test-key",
    originalFileName: "receipt.pdf",
    mimeType: "application/pdf",
    sizeBytes: 4,
    checksumSha256: "invalid",
    uploadedBy: id(),
    uploadedAt: new Date(),
  });
  await assert.rejects(() => evidence.validate(), /checksumSha256/);
  await assert.rejects(
    () => SettlementEvidence.updateOne({}, { $set: { storageKey: "changed" } }).exec(),
    /append-only/i,
  );
});

test("verified ledger state requires its snapshot and audit event", async () => {
  const state = new LedgerEntryVerificationState({ ledgerEntryId: id(), status: "VERIFIED" });
  await assert.rejects(() => state.validate(), /snapshot hash and audit event/i);
  state.verifiedSnapshotHash = "a".repeat(64);
  state.lastEventId = id();
  await state.validate();
});

test("payable verification metadata rejects a stale verified snapshot", async () => {
  const payable = new SellerPayable({
    orderId: id(), sellerId: id(), sellerSubtotal: 105_500, transactionFee: 5_500,
    payableAmount: 100_000, status: "PENDING",
    verification: {
      status: "VERIFIED", dataRevision: 2, decisionRevision: 1,
      verifiedDataRevision: 1, verifiedSnapshotHash: "a".repeat(64), lastEventId: id(),
    },
  });
  await assert.rejects(() => payable.validate(), /current snapshot/);
  payable.verification.verifiedDataRevision = 2;
  await payable.validate();
});

test("verification decisions require a complete snapshot and an administrator", async () => {
  const event = new SettlementVerification({
    subjectType: "LEDGER_ENTRY",
    subjectId: id(),
    action: "APPROVE",
    previousStatus: "UNVERIFIED",
    resultingStatus: "VERIFIED",
    decisionRevision: 1,
    actorType: "ADMIN",
    actorId: id(),
    reason: "Reviewed",
    occurredAt: new Date(),
  });
  await assert.rejects(() => event.validate(), /complete snapshot/);
  event.snapshotVersion = 1;
  event.snapshotHash = "a".repeat(64);
  event.snapshotItemCount = 1;
  event.idempotencyKey = "test-decision";
  event.requestHash = "b".repeat(64);
  await event.validate();
  event.resultingStatus = "UNVERIFIED";
  await assert.rejects(() => event.validate(), /Invalid verification status transition/);
  await assert.rejects(
    () => SettlementVerification.deleteOne({}).exec(),
    /append-only/i,
  );
});

test("snapshot items reject payloads exceeding the explicit size limit", async () => {
  const item = new SettlementVerificationSnapshotItem({
    eventId: id(),
    ordinal: 0,
    recordType: "LEDGER_ENTRY",
    recordId: id(),
    canonicalEjson: "x".repeat(128 * 1024 + 1),
  });
  await assert.rejects(() => item.validate(), /size limit/);
});

test("an incident requires evidence without assuming the reported amount", async () => {
  const incident = new SettlementIncident({
    payableId: id(),
    reportedBy: id(),
    reportedAt: new Date(),
    description: "Reported manual transfer",
  });
  await assert.rejects(() => incident.validate(), /Evidence is required/);
  incident.evidenceIds = [id()];
  await incident.validate();
  assert.equal(incident.reportedAmount, undefined);
});

test("snapshot encoding is stable and distinguishes missing, null, and zero", () => {
  const subject = "000000000000000000000001";
  const ledger = "000000000000000000000002";
  const first = [
    { recordType: "PAYABLE", recordId: subject, data: { b: null, a: 0 } },
    { recordType: "LEDGER_ENTRY", recordId: ledger, data: { amount: 10 } },
  ];
  const reordered = [
    first[1],
    { recordType: "PAYABLE", recordId: subject, data: { a: 0, b: null } },
  ];
  assert.deepEqual(buildSettlementSnapshot(1, first), buildSettlementSnapshot(1, reordered));
  assert.notEqual(canonicalSnapshotEjson({}), canonicalSnapshotEjson({ value: null }));
  assert.notEqual(canonicalSnapshotEjson({ value: null }), canonicalSnapshotEjson({ value: 0 }));
  assert.notEqual(buildSettlementSnapshot(1, first).hash, buildSettlementSnapshot(2, first).hash);
  assert.throws(() => buildSettlementSnapshot(1, [...first, first[1]]), /Duplicate/);
  assert.throws(() => canonicalSnapshotEjson({ value: undefined }), /unsupported/);
  const cyclic = {};
  cyclic.self = cyclic;
  assert.throws(() => canonicalSnapshotEjson(cyclic), /cycle/);
  assert.throws(() => buildSettlementSnapshot(1, Array(10_001).fill(first[0])), /item limit/);
});
