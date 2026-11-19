import { createHash, randomUUID, timingSafeEqual } from "node:crypto";

export const MAX_SETTLEMENT_EVIDENCE_BYTES = 5 * 1024 * 1024;
export type SettlementEvidenceMimeType = "image/png" | "image/jpeg" | "image/webp";

export interface SettlementEvidenceStorage {
  putIfAbsent(key: string, content: Uint8Array): Promise<void>;
  read(key: string): Promise<Uint8Array>;
}

// Preliminary framing checks are not a substitute for decoding untrusted images.
function identifyImage(bytes: Buffer): SettlementEvidenceMimeType | null {
  if (bytes.length >= 33 &&
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    bytes.subarray(bytes.length - 8, bytes.length - 4).equals(Buffer.from("IEND"))) return "image/png";
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff &&
    bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9) return "image/jpeg";
  if (bytes.length >= 16 && bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP" && bytes.readUInt32LE(4) + 8 === bytes.length) return "image/webp";
  return null;
}

export async function storeSettlementEvidence(input: {
  storage: SettlementEvidenceStorage;
  content: Uint8Array;
  declaredMimeType: string;
  originalFileName: string;
}) {
  if (!(input.content instanceof Uint8Array) || input.content.byteLength < 1 ||
    input.content.byteLength > MAX_SETTLEMENT_EVIDENCE_BYTES) {
    throw new Error("Settlement evidence size is invalid.");
  }
  const name = input.originalFileName.trim();
  if (!name || name.length > 255 || /[\\/\x00-\x1f\x7f]/.test(name)) {
    throw new Error("Settlement evidence filename is invalid.");
  }
  const content = Buffer.from(input.content);
  const mimeType = identifyImage(content);
  if (!mimeType || input.declaredMimeType !== mimeType) {
    throw new Error("Settlement evidence content does not match an allowed image type.");
  }
  const storageKey = `settlement-evidence/${randomUUID()}`;
  const checksumSha256 = createHash("sha256").update(content).digest("hex");
  await input.storage.putIfAbsent(storageKey, content);
  return { storageKey, originalFileName: name, mimeType, sizeBytes: content.length, checksumSha256 };
}

export async function readSettlementEvidence(input: {
  storage: SettlementEvidenceStorage;
  storageKey: string;
  sizeBytes: number;
  checksumSha256: string;
}) {
  if (!/^settlement-evidence\/[0-9a-f-]{36}$/.test(input.storageKey) ||
    !Number.isSafeInteger(input.sizeBytes) || input.sizeBytes < 1 ||
    input.sizeBytes > MAX_SETTLEMENT_EVIDENCE_BYTES || !/^[a-f\d]{64}$/.test(input.checksumSha256)) {
    throw new Error("Settlement evidence metadata is invalid.");
  }
  const content = Buffer.from(await input.storage.read(input.storageKey));
  const actual = createHash("sha256").update(content).digest();
  const expected = Buffer.from(input.checksumSha256, "hex");
  if (content.length !== input.sizeBytes || !timingSafeEqual(actual, expected)) {
    throw new Error("Settlement evidence integrity verification failed.");
  }
  return content;
}
