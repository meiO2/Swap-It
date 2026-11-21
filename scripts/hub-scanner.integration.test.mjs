import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { after, before, test } from "node:test";
import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server.js";

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/authorization") {
      return {
        url: "data:text/javascript,export const requireRole = async () => globalThis.__hubScannerTestAuth",
        shortCircuit: true,
      };
    }
    if (specifier === "@/lib/mongodb") {
      return { url: "data:text/javascript,export const connectDB = async () => globalThis.__hubScannerTestDb", shortCircuit: true };
    }
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (specifier.startsWith("@/")) {
      return { url: pathToFileURL(path.join(sourceRoot, `${specifier.slice(2)}.ts`)).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const { default: HubDevice } = await import("../src/models/HubDevice.ts");
const { default: HubAccessToken } = await import("../src/models/HubAccessToken.ts");
const { default: HubDeviceSession } = await import("../src/models/HubDeviceSession.ts");
const { default: Donation } = await import("../src/models/Donation.ts");
const { POST: scan } = await import("../src/app/api/admin/hub-scanner/route.ts");
const { POST: deviceScan } = await import("../src/app/api/iot/scan/route.ts");
const { GET: status } = await import("../src/app/api/admin/hub-scanner/[id]/route.ts");
const { POST: command } = await import("../src/app/api/iot/remote-unlock/route.ts");

const deviceId = "test-scanner-device";
const deviceKey = "isolated-test-device-key";
const baseUrl = "http://localhost:3000";
let replSet;

function request(pathname, body, headers = {}) {
  return new NextRequest(`${baseUrl}${pathname}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function adminScan(token, origin = baseUrl) {
  return scan(request("/api/admin/hub-scanner", { token }, { origin }));
}

function deviceCommand(body, key = deviceKey) {
  return command(request("/api/iot/remote-unlock", body, {
    "x-device-id": deviceId,
    "x-device-key": key,
  }));
}

async function fixture(hubId = "test-hub") {
  const token = randomBytes(32).toString("base64url");
  const userId = new mongoose.Types.ObjectId();
  const sessionId = randomUUID();
  const donation = await Donation.create({ userId, hubId, sessionId, totalItems: 0 });
  await HubAccessToken.create({
    tokenHash: createHash("sha256").update(token).digest("hex"),
    userId, hubId, activity: "DONATION", donationSessionId: sessionId,
    expiresAt: new Date(Date.now() + 300_000),
  });
  return { token, donation };
}

before(async () => {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("MONGOMS_")) delete process.env[key];
  }
  const suffix = randomUUID().replaceAll("-", "");
  const setName = `hub_${suffix}`;
  const dbName = `hub_test_${suffix}`;
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
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  assert.equal(hello.setName, setName);
  assert.equal(mongoose.connection.name, dbName);
  globalThis.__hubScannerTestDb = mongoose;
  globalThis.__hubScannerTestAuth = { success: true, user: { role: "ADMIN" } };
  process.env.HUB_SCANNER_DEVICE_ID = deviceId;
  process.env.HUB_SCANNER_API_KEY = deviceKey;
  await Promise.all([HubDevice.createIndexes(), HubAccessToken.createIndexes(), HubDeviceSession.createIndexes(), Donation.createIndexes()]);
  await HubDevice.create({
    deviceId, hubId: "test-hub", status: "ACTIVE",
    apiKeyHash: createHash("sha256").update(deviceKey).digest("hex"),
  });
});

after(async () => {
  delete globalThis.__hubScannerTestDb;
  delete globalThis.__hubScannerTestAuth;
  await mongoose.disconnect();
  if (replSet) await replSet.stop();
});

test("admin and same-origin checks reject unauthorized scan requests", async () => {
  globalThis.__hubScannerTestAuth = { success: false, response: NextResponse.json({ success: false }, { status: 403 }) };
  assert.equal((await adminScan("a".repeat(43))).status, 403);
  globalThis.__hubScannerTestAuth = { success: true, user: { role: "ADMIN" } };
  assert.equal((await adminScan("a".repeat(43), "https://other.invalid")).status, 403);
  assert.equal((await adminScan("BUKA_PINTU")).status, 400);
  assert.equal((await deviceCommand({ action: "CLAIM" }, "wrong-key")).status, 401);
});

test("donation token creates one command, claimed once and acknowledged idempotently", async () => {
  const { token, donation } = await fixture();
  const first = await adminScan(token);
  assert.equal(first.status, 200);
  const result = await first.json();
  assert.equal(result.action, "UNLOCK");
  assert.equal((await Donation.findById(donation._id).lean()).status, "SESSION_CREATED");
  assert.equal((await adminScan(token)).status, 409);

  const claims = await Promise.all([
    deviceCommand({ action: "CLAIM" }), deviceCommand({ action: "CLAIM" }),
  ]);
  const claimBodies = await Promise.all(claims.map((response) => response.json()));
  assert.equal(claimBodies.filter((body) => body.action === "UNLOCK").length, 1);
  assert.equal(claimBodies.filter((body) => body.action === "NONE").length, 1);
  const claim = claimBodies.find((body) => body.action === "UNLOCK");
  assert.equal(claim.data.sessionId, result.data.sessionId);
  assert.ok(claim.data.validForMs > 0 && claim.data.validForMs <= 30_000);
  assert.equal((await Donation.findById(donation._id).lean()).status, "SESSION_CREATED");
  assert.equal((await deviceCommand({ action: "RELAY_ACTIVATED", sessionId: claim.data.sessionId })).status, 200);
  assert.equal((await deviceCommand({ action: "RELAY_ACTIVATED", sessionId: claim.data.sessionId })).status, 200);
  assert.equal((await Donation.findById(donation._id).lean()).status, "QR_SCANNED");
  const get = await status(new NextRequest(`${baseUrl}/api/admin/hub-scanner/${claim.data.sessionId}`), { params: Promise.resolve({ id: claim.data.sessionId }) });
  assert.equal((await get.json()).data.status, "RELAY_ACTIVATED");
});

test("other-hub and expired commands cannot activate or advance a donation", async () => {
  const otherHub = await fixture("another-hub");
  assert.equal((await adminScan(otherHub.token)).status, 409);
  const { token, donation } = await fixture();
  const result = await (await adminScan(token)).json();
  await HubDeviceSession.updateOne({ _id: result.data.sessionId }, { $set: { "remoteUnlock.expiresAt": new Date(Date.now() - 1) } });
  assert.equal((await (await deviceCommand({ action: "CLAIM" })).json()).action, "NONE");
  assert.equal((await deviceCommand({ action: "RELAY_ACTIVATED", sessionId: result.data.sessionId })).status, 409);
  assert.equal((await Donation.findById(donation._id).lean()).status, "SESSION_CREATED");
  const get = await status(new NextRequest(`${baseUrl}/api/admin/hub-scanner/${result.data.sessionId}`), { params: Promise.resolve({ id: result.data.sessionId }) });
  assert.equal((await get.json()).data.status, "EXPIRED");
});

test("a second token cannot create a competing command for the same donation", async () => {
  const { token, donation } = await fixture();
  const first = await (await adminScan(token)).json();
  const secondToken = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(secondToken).digest("hex");
  await HubAccessToken.create({
    tokenHash, userId: donation.userId, hubId: donation.hubId,
    activity: "DONATION", donationSessionId: donation.sessionId,
    expiresAt: new Date(Date.now() + 300_000),
  });
  assert.equal((await adminScan(secondToken)).status, 409);
  assert.equal((await HubAccessToken.findOne({ tokenHash }).lean()).status, "ACTIVE");
  assert.equal(await HubDeviceSession.countDocuments({ donationSessionId: donation.sessionId }), 1);
  await HubDeviceSession.updateOne({ _id: first.data.sessionId }, { $set: { "remoteUnlock.expiresAt": new Date(Date.now() - 1) } });
  await Donation.updateOne({ _id: donation._id }, { $set: { "remoteUnlockPending.expiresAt": new Date(Date.now() - 1) } });
  assert.equal((await adminScan(secondToken)).status, 200);
});

test("expired claimed commands cannot advance a donation on a late acknowledgement", async () => {
  await HubDeviceSession.updateMany({ "remoteUnlock.status": "PENDING" }, { $set: { "remoteUnlock.expiresAt": new Date(Date.now() - 1) } });
  const { token, donation } = await fixture();
  const scanResult = await (await adminScan(token)).json();
  const claim = await (await deviceCommand({ action: "CLAIM" })).json();
  assert.equal(claim.data.sessionId, scanResult.data.sessionId);
  await HubDeviceSession.updateOne({ _id: claim.data.sessionId }, { $set: { "remoteUnlock.expiresAt": new Date(Date.now() - 1) } });
  assert.equal((await deviceCommand({ action: "RELAY_ACTIVATED", sessionId: claim.data.sessionId })).status, 409);
  assert.equal((await Donation.findById(donation._id).lean()).status, "SESSION_CREATED");
});

test("existing device-camera scans still advance the donation without a remote command", async () => {
  const { token, donation } = await fixture();
  const response = await deviceScan(request("/api/iot/scan", { token }, {
    "x-device-id": deviceId, "x-device-key": deviceKey,
  }));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.action, "UNLOCK");
  assert.equal((await Donation.findById(donation._id).lean()).status, "QR_SCANNED");
  assert.equal((await HubDeviceSession.findById(result.data.sessionId).lean()).remoteUnlock, undefined);
});
