import { createHash } from "node:crypto";
import { BSON } from "mongodb";
import type { ISettlementVerificationSnapshotItem } from "../models/SettlementVerificationSnapshotItem.ts";

type SnapshotRecord = {
  recordType: ISettlementVerificationSnapshotItem["recordType"];
  recordId: string;
  data: unknown;
};

export const MAX_SNAPSHOT_ITEM_BYTES = 128 * 1024;
export const MAX_SNAPSHOT_BYTES = 8 * 1024 * 1024;
export const MAX_SNAPSHOT_ITEMS = 10_000;

function assertSupported(value: unknown, ancestors = new Set<object>()): void {
  if (value === undefined || typeof value === "function" || typeof value === "symbol") {
    throw new TypeError("Snapshot contains an unsupported value.");
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) throw new TypeError("Snapshot contains a cycle.");
    ancestors.add(value);
    for (let index = 0; index < value.length; index += 1) {
      if (!(index in value)) throw new TypeError("Snapshot contains a sparse array.");
      assertSupported(value[index], ancestors);
    }
    ancestors.delete(value);
    return;
  }
  if (value && typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype === Object.prototype || prototype === null) {
      if (ancestors.has(value)) throw new TypeError("Snapshot contains a cycle.");
      ancestors.add(value);
      for (const item of Object.values(value)) assertSupported(item, ancestors);
      ancestors.delete(value);
    } else if (!(value instanceof Date) && !("_bsontype" in value)) {
      throw new TypeError("Snapshot contains an unsupported object.");
    }
  }
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, item]) => [key, sortJson(item)]),
    );
  }
  return value;
}

export function canonicalSnapshotEjson(value: unknown): string {
  assertSupported(value);
  const serialized = BSON.EJSON.stringify(value, { relaxed: false });
  if (typeof serialized !== "string") {
    throw new TypeError("Snapshot cannot be serialized.");
  }
  return JSON.stringify(sortJson(JSON.parse(serialized)));
}

export function buildSettlementSnapshot(version: number, records: SnapshotRecord[]) {
  if (!Number.isSafeInteger(version) || version < 1 || records.length === 0) {
    throw new RangeError("Snapshot requires a version and at least one record.");
  }
  if (records.length > MAX_SNAPSHOT_ITEMS) {
    throw new RangeError("Snapshot exceeds the item limit.");
  }
  const seen = new Set<string>();
  const items = records.map((record) => {
    if (!["PAYABLE", "RECOVERY", "RECOVERY_ENTRY", "LEDGER_ENTRY", "ACTOR_RESOLUTION"].includes(record.recordType)) {
      throw new TypeError("Invalid snapshot record type.");
    }
    if (!/^[a-f\d]{24}$/.test(record.recordId)) {
      throw new TypeError("Snapshot record ID must be a canonical ObjectId.");
    }
    const identity = `${record.recordType}:${record.recordId}`;
    if (seen.has(identity)) throw new Error("Duplicate snapshot record.");
    seen.add(identity);
    const canonicalEjson = canonicalSnapshotEjson(record.data);
    if (Buffer.byteLength(canonicalEjson, "utf8") > MAX_SNAPSHOT_ITEM_BYTES) {
      throw new RangeError("Snapshot item exceeds the size limit.");
    }
    return { recordType: record.recordType, recordId: record.recordId, canonicalEjson };
  }).sort((left, right) => {
    const leftKey = `${left.recordType}:${left.recordId}`;
    const rightKey = `${right.recordType}:${right.recordId}`;
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  }).map((item, ordinal) => ({ ...item, ordinal }));

  const canonicalSnapshot = canonicalSnapshotEjson({ version, items });
  if (Buffer.byteLength(canonicalSnapshot, "utf8") > MAX_SNAPSHOT_BYTES) {
    throw new RangeError("Snapshot exceeds the total size limit.");
  }
  const hash = createHash("sha256")
    .update(canonicalSnapshot, "utf8")
    .digest("hex");
  return { version, items, hash };
}
