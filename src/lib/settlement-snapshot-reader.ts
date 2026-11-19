import mongoose, { type ClientSession } from "mongoose";
import SellerPayable from "../models/SellerPayable.ts";
import SellerRecovery from "../models/SellerRecovery.ts";
import SellerSettlementLedger from "../models/SellerSettlementLedger.ts";
import SettlementActorResolution from "../models/SettlementActorResolution.ts";
import { buildSettlementSnapshot, MAX_SNAPSHOT_ITEMS } from "./settlement-snapshot.ts";
import type { SettlementVerificationSubject } from "../models/SettlementVerification.ts";

type RawRecord = Record<string, unknown> & { _id: mongoose.Types.ObjectId };

export class SettlementSnapshotIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SettlementSnapshotIntegrityError";
  }
}

function sameId(left: unknown, right: unknown): boolean {
  return left instanceof mongoose.Types.ObjectId &&
    right instanceof mongoose.Types.ObjectId &&
    left.equals(right);
}

function financialData(record: RawRecord) {
  const data = { ...record };
  delete data.verification;
  delete data.financialControl;
  delete data.updatedAt;
  return data;
}

function requireConsistentOwnership(record: RawRecord, payable: RawRecord) {
  if (!sameId(record.orderId, payable.orderId) || !sameId(record.sellerId, payable.sellerId)) {
    throw new SettlementSnapshotIntegrityError("Settlement subject ownership does not match the payable.");
  }
}

async function actorResolutionRecords(ledgerIds: mongoose.Types.ObjectId[], session: ClientSession) {
  const resolutions = await SettlementActorResolution.collection.find(
    { ledgerEntryId: { $in: ledgerIds } }, { session },
  ).limit(MAX_SNAPSHOT_ITEMS + 1).toArray() as RawRecord[];
  return resolutions.map((resolution) => ({
    recordType: "ACTOR_RESOLUTION" as const,
    recordId: resolution._id.toHexString(),
    data: resolution,
  }));
}

export async function readSettlementSnapshot(input: {
  subjectType: SettlementVerificationSubject;
  subjectId: mongoose.Types.ObjectId;
  session: ClientSession;
}) {
  if (!input.session.inTransaction()) throw new Error("Snapshot requires an active transaction.");
  if (!(input.subjectId instanceof mongoose.Types.ObjectId)) throw new Error("Invalid snapshot subject.");

  if (input.subjectType === "LEDGER_ENTRY") {
    const entry = await SellerSettlementLedger.collection.findOne(
      { _id: input.subjectId }, { session: input.session },
    ) as RawRecord | null;
    if (!entry) throw new Error("Settlement ledger entry not found.");
    return buildSettlementSnapshot(1, [{
      recordType: "LEDGER_ENTRY", recordId: entry._id.toHexString(), data: entry,
    }, ...await actorResolutionRecords([entry._id], input.session)]);
  }
  if (input.subjectType !== "PAYABLE_RECONCILIATION" && input.subjectType !== "RECOVERY") {
    throw new Error("Invalid snapshot subject type.");
  }

  let recoveries: RawRecord[];
  let payable: RawRecord | null;
  if (input.subjectType === "RECOVERY") {
    const recovery = await SellerRecovery.collection.findOne(
      { _id: input.subjectId }, { session: input.session },
    ) as RawRecord | null;
    if (!recovery) throw new Error("Seller recovery not found.");
    if (!(recovery.payableId instanceof mongoose.Types.ObjectId)) {
      throw new SettlementSnapshotIntegrityError("Recovery has no valid payable reference.");
    }
    payable = await SellerPayable.collection.findOne(
      { _id: recovery.payableId }, { session: input.session },
    ) as RawRecord | null;
    recoveries = [recovery];
  } else {
    payable = await SellerPayable.collection.findOne(
      { _id: input.subjectId }, { session: input.session },
    ) as RawRecord | null;
    recoveries = await SellerRecovery.collection.find(
      { payableId: input.subjectId }, { session: input.session },
    ).limit(MAX_SNAPSHOT_ITEMS + 1).toArray() as RawRecord[];
  }
  if (!payable) throw new SettlementSnapshotIntegrityError("Related seller payable not found.");

  const recoveryIds = recoveries.map((recovery) => recovery._id);
  const ledgerFilter = input.subjectType === "RECOVERY"
    ? { sellerRecoveryId: input.subjectId }
    : { $or: [{ sellerPayableId: payable._id }, { sellerRecoveryId: { $in: recoveryIds } }] };
  const ledger = await SellerSettlementLedger.collection.find(
    ledgerFilter, { session: input.session },
  ).limit(MAX_SNAPSHOT_ITEMS + 1).toArray() as RawRecord[];
  if (recoveries.length + ledger.length > MAX_SNAPSHOT_ITEMS) {
    throw new RangeError("Snapshot exceeds the item limit.");
  }

  const records: Parameters<typeof buildSettlementSnapshot>[1] = [];
  if (input.subjectType === "PAYABLE_RECONCILIATION") {
    records.push({ recordType: "PAYABLE", recordId: payable._id.toHexString(), data: financialData(payable) });
  }
  for (const recovery of recoveries) {
    requireConsistentOwnership(recovery, payable);
    if (!sameId(recovery.payableId, payable._id)) {
      throw new SettlementSnapshotIntegrityError("Recovery references a different payable.");
    }
    records.push({ recordType: "RECOVERY", recordId: recovery._id.toHexString(), data: financialData(recovery) });
    if (!Array.isArray(recovery.entries)) {
      throw new SettlementSnapshotIntegrityError("Recovery entries are missing or invalid.");
    }
    for (const entry of recovery.entries) {
      if (!entry || typeof entry !== "object" || !(entry._id instanceof mongoose.Types.ObjectId)) {
        throw new SettlementSnapshotIntegrityError("Recovery entry has no valid ID.");
      }
      records.push({ recordType: "RECOVERY_ENTRY", recordId: entry._id.toHexString(), data: entry });
    }
  }
  for (const entry of ledger) {
    requireConsistentOwnership(entry, payable);
    if (!sameId(entry.sellerPayableId, payable._id)) {
      throw new SettlementSnapshotIntegrityError("Ledger entry references a different payable.");
    }
    if (entry.sellerRecoveryId !== undefined &&
      !recoveryIds.some((recoveryId) => sameId(entry.sellerRecoveryId, recoveryId))) {
      throw new SettlementSnapshotIntegrityError("Ledger entry references a different recovery.");
    }
    if (entry.entryType === "REFUND_RECOVERY" && entry.sellerRecoveryId === undefined) {
      throw new SettlementSnapshotIntegrityError("Recovery ledger entry has no recovery reference.");
    }
    if (entry.entryType !== "REFUND_RECOVERY" && entry.sellerRecoveryId !== undefined) {
      throw new SettlementSnapshotIntegrityError("Non-recovery ledger entry references a recovery.");
    }
    records.push({ recordType: "LEDGER_ENTRY", recordId: entry._id.toHexString(), data: entry });
  }
  records.push(...await actorResolutionRecords(ledger.map((entry) => entry._id), input.session));
  return buildSettlementSnapshot(1, records);
}
