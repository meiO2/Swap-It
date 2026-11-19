import type { ClientSession, Types } from "mongoose";
import SettlementOrderFence from "../models/SettlementOrderFence.ts";

export async function touchSettlementOrderFence(
  orderId: Types.ObjectId,
  session: ClientSession,
) {
  if (!session.inTransaction()) {
    throw new Error("Settlement order fence requires an active transaction.");
  }

  const fence = await SettlementOrderFence.findOneAndUpdate(
    { _id: orderId },
    { $inc: { revision: 1 } },
    { returnDocument: "after", upsert: true, session, setDefaultsOnInsert: false },
  );
  if (!fence) throw new Error("Settlement order fence could not be updated.");
  return fence.revision;
}
