import mongoose, { type ClientSession } from "mongoose";
import SellerPayable from "../models/SellerPayable.ts";
import SellerRecovery from "../models/SellerRecovery.ts";
import SettlementFinancialControlEvent from "../models/SettlementFinancialControlEvent.ts";
import SettlementFinancialHold from "../models/SettlementFinancialHold.ts";
import { touchSettlementOrderFence } from "./settlement-order-fence.ts";
import type { SettlementHoldReason } from "./settlement-verification-policy.ts";

export async function createSettlementFinancialHold(input: {
  holdId: mongoose.Types.ObjectId;
  orderId: mongoose.Types.ObjectId;
  subjectType: "PAYABLE" | "RECOVERY";
  subjectId: mongoose.Types.ObjectId;
  reason: SettlementHoldReason;
  description: string;
  actor: { type: "SYSTEM" } | { type: "ADMIN"; id: mongoose.Types.ObjectId };
  session: ClientSession;
}) {
  if (!input.session.inTransaction()) throw new Error("Creating a financial hold requires an active transaction.");
  for (const id of [input.holdId, input.orderId, input.subjectId]) {
    if (!(id instanceof mongoose.Types.ObjectId)) throw new Error("Invalid financial hold ID.");
  }
  if (!["PAYABLE", "RECOVERY"].includes(input.subjectType) ||
    !["INTEGRITY_MISMATCH", "FINANCIAL_INVARIANT_FAILED", "UNRESOLVED_AMOUNT_PROVENANCE"].includes(input.reason)) {
    throw new Error("Invalid financial hold subject or reason.");
  }
  const description = input.description.trim();
  if (!description || description.length > 1000) throw new Error("A financial hold description is required.");
  if (input.actor.type !== "SYSTEM" && input.actor.type !== "ADMIN") throw new Error("Invalid financial hold actor.");
  if (input.actor.type === "ADMIN" && !(input.actor.id instanceof mongoose.Types.ObjectId)) {
    throw new Error("An ADMIN financial hold requires an actor.");
  }

  await touchSettlementOrderFence(input.orderId, input.session);
  const collection = input.subjectType === "PAYABLE" ? SellerPayable.collection : SellerRecovery.collection;
  const subject = await collection.findOne(
    { _id: input.subjectId, orderId: input.orderId },
    { session: input.session, projection: { _id: 1 } },
  );
  if (!subject) throw new Error("Financial hold subject does not belong to this order.");

  const existing = await SettlementFinancialHold.findById(input.holdId).session(input.session);
  if (existing) {
    const event = await SettlementFinancialControlEvent.findOne({
      holdId: input.holdId, action: "CREATED",
    }).session(input.session);
    if (!event ||
      existing.subjectType !== input.subjectType || !existing.subjectId.equals(input.subjectId) ||
      existing.reason !== input.reason || existing.description !== description ||
      event.actorType !== input.actor.type ||
      (input.actor.type === "ADMIN" && !event.actorId?.equals(input.actor.id)) ||
      event.reason !== description) {
      throw new Error("Financial hold ID conflicts with an existing record.");
    }
    return existing;
  }
  const [hold] = await SettlementFinancialHold.create([{
    _id: input.holdId,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    reason: input.reason,
    status: "ACTIVE",
    description,
  }], { session: input.session });
  await SettlementFinancialControlEvent.create([{
    holdId: hold._id,
    action: "CREATED",
    actorType: input.actor.type,
    ...(input.actor.type === "ADMIN" ? { actorId: input.actor.id } : {}),
    reason: description,
    occurredAt: new Date(),
  }], { session: input.session });
  return hold;
}
