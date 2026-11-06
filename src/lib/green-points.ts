import mongoose from "mongoose";
import GreenPointLedger, { type GreenPointTransactionType } from "@/models/GreenPointLedger";

export const GREEN_POINT_REWARDS = {
  registration: 2000,
  donationTemporaryPerItem: 1500,
  donationResaleQualityPerItem: 5000,
  donationUpcyclingQualityPerItem: 3000,
  donationSocialPerItem: 2000,
  purchaseRate: 0.02,
} as const;

function expiryFrom(date: Date) {
  const expiry = new Date(date);
  expiry.setFullYear(expiry.getFullYear() + 1);
  return expiry;
}

export async function awardGreenPoints(input: {
  userId: string;
  amount: number;
  description: string;
  referenceKey: string;
  type?: Extract<GreenPointTransactionType, "EARN" | "REFUND" | "ADJUSTMENT">;
  session?: import("mongoose").ClientSession;
}) {
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
    throw new RangeError("Green Point amount must be a positive integer.");
  }

  const existing = await GreenPointLedger.findOne({ referenceKey: input.referenceKey }).session(input.session ?? null);
  if (existing) return existing;

  return GreenPointLedger.create(
    [{
      userId: input.userId,
      type: input.type ?? "EARN",
      amount: input.amount,
      description: input.description,
      referenceKey: input.referenceKey,
      expiresAt: expiryFrom(new Date()),
    }],
    { session: input.session },
  ).then((created) => created[0]);
}

export async function getGreenPointBalance(
  userId: string,
  now = new Date(),
  session?: import("mongoose").ClientSession,
) {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error("Invalid user ID for Green Point balance.");
  }
  const result = await GreenPointLedger.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: now } }],
      },
    },
    { $group: { _id: null, balance: { $sum: "$amount" } } },
  ]).session(session ?? null);
  return result[0]?.balance ?? 0;
}

export async function redeemGreenPoints(input: {
  userId: string;
  amount: number;
  referenceKey: string;
  session?: import("mongoose").ClientSession;
}) {
  if (!Number.isSafeInteger(input.amount) || input.amount < 0) {
    throw new RangeError("Green Point redemption must be a non-negative integer.");
  }
  if (input.amount === 0) return null;
  const balance = await getGreenPointBalance(input.userId, new Date(), input.session);
  if (input.amount > balance) {
    throw new RangeError(`Insufficient Green Points: ${balance} GP available, ${input.amount} GP requested.`);
  }
  const existing = await GreenPointLedger.findOne({ referenceKey: input.referenceKey }).session(input.session ?? null);
  if (existing) return existing;
  return GreenPointLedger.create([{
    userId: input.userId,
    type: "REDEEM",
    amount: -input.amount,
    description: "Green Points used at checkout",
    referenceKey: input.referenceKey,
  }], { session: input.session }).then((created) => created[0]);
}
