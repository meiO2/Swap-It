import mongoose, { type ClientSession } from "mongoose";
import GreenPointLedger, {
  type GreenPointTransactionType,
} from "@/models/GreenPointLedger";
import GreenPointRedemptionReservation from "@/models/GreenPointRedemptionReservation";
import GreenPointReserveAccount from "@/models/GreenPointReserveAccount";
import GreenPointReserveLedger from "@/models/GreenPointReserveLedger";
import PendingGreenPointCredit, {
  type IPendingGreenPointCredit,
  type PendingGreenPointCreditSource,
  type PendingGreenPointLedgerType,
} from "@/models/PendingGreenPointCredit";
import Order from "@/models/Order";
import Refund from "@/models/Refund";
import RefundTransaction from "@/models/RefundTransaction";
import BuyerRefundEntitlement from "@/models/BuyerRefundEntitlement";
import { touchSettlementOrderFence } from "@/lib/settlement-order-fence";

export { GREEN_POINT_REWARDS } from "@/lib/green-point-rewards";

const RESERVE_ID = "SWAPIT";

type CreditComponent = {
  amount: number;
  description: string;
  referenceKey: string;
  ledgerType: PendingGreenPointLedgerType;
};

function expiryFrom(date: Date) {
  const expiry = new Date(date);
  expiry.setFullYear(expiry.getFullYear() + 1);
  return expiry;
}

function validatePositiveAmount(amount: number, label: string) {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new RangeError(`${label} must be a positive integer.`);
  }
}

async function inTransaction<T>(
  session: ClientSession | undefined,
  operation: (transaction: ClientSession) => Promise<T>,
): Promise<T> {
  if (session) return operation(session);

  const transaction = await mongoose.startSession();
  let result!: T;
  let completed = false;
  try {
    await transaction.withTransaction(async () => {
      result = await operation(transaction);
      completed = true;
    });
  } finally {
    await transaction.endSession();
  }
  if (!completed) throw new Error("Green Point transaction did not complete.");
  return result;
}

async function ensureReserveAccount(session: ClientSession) {
  return GreenPointReserveAccount.findOneAndUpdate(
    { _id: RESERVE_ID },
    {
      $setOnInsert: {
        balance: 0,
        reservedRedemptions: 0,
        targetBalance: 100_000,
        warningThreshold: 20_000,
        revision: 0,
      },
    },
    { upsert: true, new: true, session, setDefaultsOnInsert: true },
  );
}

async function lockReserveAccount(session: ClientSession) {
  await ensureReserveAccount(session);
  const account = await GreenPointReserveAccount.findOneAndUpdate(
    { _id: RESERVE_ID },
    { $inc: { revision: 1 } },
    { new: true, session },
  );
  if (!account) throw new Error("Green Point reserve account is unavailable.");
  return account;
}

async function getOutstandingLiability(
  now = new Date(),
  session?: ClientSession,
) {
  const aggregate = GreenPointLedger.aggregate([
    {
      $match: {
        $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: now } }],
      },
    },
    { $group: { _id: "$userId", balance: { $sum: "$amount" } } },
    { $match: { balance: { $gt: 0 } } },
    { $group: { _id: null, total: { $sum: "$balance" } } },
  ]);
  if (session) aggregate.session(session);
  const result = await aggregate;
  return result[0]?.total ?? 0;
}

async function getPendingRefundAmount(session?: ClientSession) {
  const aggregate = PendingGreenPointCredit.aggregate([
    { $match: { status: "PENDING_REFUND_GP" } },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);
  if (session) aggregate.session(session);
  const result = await aggregate;
  return result[0]?.total ?? 0;
}

async function getPendingCredits(
  status: "PENDING_REFUND_GP" | "PENDING_REWARD",
  session: ClientSession,
) {
  return PendingGreenPointCredit.find({ status })
    .sort({ createdAt: 1, _id: 1 })
    .session(session);
}

async function updateRefundAfterGpIssuance(
  credit: IPendingGreenPointCredit,
  session: ClientSession,
) {
  if (!credit.refundId) return;

  await RefundTransaction.updateMany(
    {
      refundId: credit.refundId,
      idempotencyKey: {
        $in: credit.components.map((component) => component.referenceKey),
      },
      status: "PENDING",
    },
    {
      $set: {
        status: "COMPLETED",
        processedAt: new Date(),
        provider: "INTERNAL_GP",
      },
    },
    { session },
  );

  const transactions = await RefundTransaction.find({
    refundId: credit.refundId,
  })
    .session(session)
    .lean();
  if (!transactions.length) return;

  const hasPending = transactions.some((entry) => entry.status === "PENDING");
  const hasFailed = transactions.some((entry) => entry.status === "FAILED");
  const hasCompleted = transactions.some(
    (entry) => entry.status === "COMPLETED",
  );
  const status = hasPending || (hasFailed && hasCompleted)
    ? "PARTIALLY_COMPLETED"
    : hasFailed
      ? "FAILED"
      : "COMPLETED";
  await Refund.updateOne(
    { _id: credit.refundId },
    {
      $set: { status },
      $push: {
        auditLog: {
          status,
          note: "Pending Green Point refund funded from the reserve.",
          at: new Date(),
        },
      },
    },
    { session },
  );
  if (status === "COMPLETED" && credit.orderId && credit.source === "REFUND") {
    await BuyerRefundEntitlement.updateOne(
      { orderId: credit.orderId, refundId: credit.refundId, status: "GP_PENDING" },
      { $set: { status: "GP_ISSUED" } },
      { session },
    );
  }
  if (
    status === "COMPLETED" &&
    credit.orderId &&
    credit.source === "REFUND"
  ) {
    const refund = await Refund.findById(credit.refundId)
      .select("reason")
      .session(session);
    if (refund?.reason !== "QUALITY_INSPECTION_FAILED") {
      await Order.updateOne(
        { _id: credit.orderId, status: { $nin: ["CANCELLED", "REFUNDED"] } },
        { $set: { status: "REFUNDED" } },
        { session },
      );
    }
  }
}

async function issuePendingCredit(
  credit: IPendingGreenPointCredit,
  session: ClientSession,
) {
  if (credit.source === "REFUND" && credit.orderId) {
    await touchSettlementOrderFence(credit.orderId, session);
  }
  const issuedAt = new Date();
  for (const component of credit.components) {
    const existing = await GreenPointLedger.findOne({
      referenceKey: component.referenceKey,
    }).session(session);
    if (existing) {
      if (!existing.userId.equals(credit.userId) || existing.amount !== component.amount ||
        existing.type !== component.ledgerType) {
        throw new Error("Green Point credit component conflicts with an existing ledger entry.");
      }
      continue;
    }

    await GreenPointLedger.create(
      [
        {
          userId: credit.userId,
          type: component.ledgerType,
          amount: component.amount,
          description: component.description,
          referenceKey: component.referenceKey,
          expiresAt: expiryFrom(issuedAt),
        },
      ],
      { session },
    );
  }

  await PendingGreenPointCredit.updateOne(
    { _id: credit._id, status: credit.status },
    { $set: { status: "ISSUED", issuedAt } },
    { session },
  );
  await updateRefundAfterGpIssuance(credit, session);
}

async function processPendingGreenPointCredits(session: ClientSession) {
  let issuedRefunds = 0;
  let issuedRewards = 0;
  const pendingRefunds = await getPendingCredits("PENDING_REFUND_GP", session);

  for (const credit of pendingRefunds) {
    const account = await lockReserveAccount(session);
    const liability = await getOutstandingLiability(new Date(), session);
    if (
      account.balance <
      liability + account.reservedRedemptions + credit.amount
    ) {
      break;
    }
    await issuePendingCredit(credit, session);
    issuedRefunds += 1;
  }

  if (
    await PendingGreenPointCredit.exists({ status: "PENDING_REFUND_GP" }).session(
      session,
    )
  ) {
    return { issuedRefunds, issuedRewards };
  }

  const pendingRewards = await getPendingCredits("PENDING_REWARD", session);
  for (const credit of pendingRewards) {
    const account = await lockReserveAccount(session);
    const liability = await getOutstandingLiability(new Date(), session);
    if (
      account.balance <
      liability + account.reservedRedemptions + credit.amount
    ) {
      break;
    }
    await issuePendingCredit(credit, session);
    issuedRewards += 1;
  }

  return { issuedRefunds, issuedRewards };
}

async function createPendingCredit(input: {
  userId: string;
  amount: number;
  source: PendingGreenPointCreditSource;
  description: string;
  referenceKey: string;
  components: CreditComponent[];
  refundId?: string;
  orderId?: string;
  session?: ClientSession;
}) {
  validatePositiveAmount(input.amount, "Green Point amount");
  if (!input.referenceKey.trim()) {
    throw new Error("Green Point reference key is required.");
  }
  if (!mongoose.Types.ObjectId.isValid(input.userId)) {
    throw new Error("Invalid user ID for Green Point credit.");
  }
  if (
    input.components.reduce((total, component) => total + component.amount, 0) !==
    input.amount
  ) {
    throw new RangeError("Green Point credit components must sum to the amount.");
  }

  return inTransaction(input.session, async (session) => {
    const existing = await PendingGreenPointCredit.findOne({
      referenceKey: input.referenceKey,
    }).session(session);
    if (existing) {
      if (input.source === "REFUND" && (
        !existing.userId.equals(input.userId) || existing.amount !== input.amount ||
        existing.source !== input.source ||
        existing.status === "CANCELLED" ||
        (input.orderId && existing.orderId?.toString() !== input.orderId) ||
        (input.refundId && existing.refundId?.toString() !== input.refundId) ||
        existing.components.length !== input.components.length ||
        existing.components.some((component, index) =>
          component.amount !== input.components[index].amount ||
          component.referenceKey !== input.components[index].referenceKey ||
          component.ledgerType !== input.components[index].ledgerType)
      )) throw new Error("Green Point refund reference conflicts with an existing credit.");
      return existing;
    }

    const existingLedger = await GreenPointLedger.findOne({
      referenceKey: input.referenceKey,
    }).session(session);
    if (existingLedger) {
      if (input.source === "REFUND" && (
        !existingLedger.userId.equals(input.userId) ||
        existingLedger.amount !== input.amount || existingLedger.type !== "REFUND"
      )) throw new Error("Green Point refund reference conflicts with an existing ledger entry.");
      return existingLedger;
    }

    const isRefund = input.source === "REFUND";
    const [credit] = await PendingGreenPointCredit.create(
      [
        {
          userId: new mongoose.Types.ObjectId(input.userId),
          amount: input.amount,
          source: input.source,
          status: isRefund ? "PENDING_REFUND_GP" : "PENDING_REWARD",
          description: input.description,
          referenceKey: input.referenceKey,
          components: input.components,
          refundId: input.refundId
            ? new mongoose.Types.ObjectId(input.refundId)
            : undefined,
          orderId: input.orderId
            ? new mongoose.Types.ObjectId(input.orderId)
            : undefined,
        },
      ],
      { session },
    );
    await processPendingGreenPointCredits(session);
    return (
      (await PendingGreenPointCredit.findById(credit._id).session(session)) ??
      credit
    );
  });
}

export async function awardGreenPoints(input: {
  userId: string;
  amount: number;
  description: string;
  referenceKey: string;
  type?: Extract<
    GreenPointTransactionType,
    "EARN" | "REFUND" | "ADJUSTMENT"
  >;
  source?: PendingGreenPointCreditSource;
  orderId?: string;
  refundId?: string;
  session?: ClientSession;
}) {
  const type = input.type ?? "EARN";
  const source =
    input.source ??
    (type === "REFUND" ? "REFUND" : "OTHER");
  return createPendingCredit({
    userId: input.userId,
    amount: input.amount,
    source,
    description: input.description,
    referenceKey: input.referenceKey,
    components: [
      {
        amount: input.amount,
        description: input.description,
        referenceKey: input.referenceKey,
        ledgerType: type,
      },
    ],
    orderId: input.orderId,
    refundId: input.refundId,
    session: input.session,
  });
}

export async function queueGreenPointRefund(input: {
  userId: string;
  amount: number;
  description: string;
  referenceKey: string;
  components: CreditComponent[];
  orderId?: string;
  refundId?: string;
  session?: ClientSession;
}) {
  return createPendingCredit({
    ...input,
    source: "REFUND",
  });
}

export async function getGreenPointBalance(
  userId: string,
  now = new Date(),
  session?: ClientSession,
) {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error("Invalid user ID for Green Point balance.");
  }
  const aggregate = GreenPointLedger.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: now } }],
      },
    },
    { $group: { _id: null, balance: { $sum: "$amount" } } },
  ]);
  if (session) aggregate.session(session);
  const result = await aggregate;
  return result[0]?.balance ?? 0;
}

export async function getGreenPointReserveSnapshot(now = new Date()) {
  let account = await GreenPointReserveAccount.findById(RESERVE_ID);
  if (!account) {
    account = await GreenPointReserveAccount.findOneAndUpdate(
      { _id: RESERVE_ID },
      {
        $setOnInsert: {
          balance: 0,
          reservedRedemptions: 0,
          targetBalance: 100_000,
          warningThreshold: 20_000,
          revision: 0,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }
  if (!account) throw new Error("Green Point reserve account is unavailable.");
  const [outstandingLiability, pendingRefundGp] = await Promise.all([
    getOutstandingLiability(now),
    getPendingRefundAmount(),
  ]);
  const requiredCoverage =
    outstandingLiability + pendingRefundGp + account.reservedRedemptions;
  const reserveShortfall = Math.max(0, requiredCoverage - account.balance);
  return {
    balance: account.balance,
    targetBalance: account.targetBalance,
    warningThreshold: account.warningThreshold,
    outstandingLiability,
    pendingRefundGp,
    reservedRedemptions: account.reservedRedemptions,
    reserveShortfall,
    redemptionAllowed: reserveShortfall === 0,
    belowWarningThreshold: account.balance < account.warningThreshold,
  };
}

export async function redeemGreenPoints(input: {
  userId: string;
  orderId: string;
  amount: number;
  referenceKey: string;
  session?: ClientSession;
}) {
  if (!Number.isSafeInteger(input.amount) || input.amount < 0) {
    throw new RangeError("Green Point redemption must be a non-negative integer.");
  }
  if (!mongoose.Types.ObjectId.isValid(input.orderId)) {
    throw new Error("Invalid order ID for Green Point redemption.");
  }
  if (input.amount === 0) return null;
  if (!mongoose.Types.ObjectId.isValid(input.userId)) {
    throw new Error("Invalid user ID for Green Point redemption.");
  }

  return inTransaction(input.session, async (session) => {
    const orderId = new mongoose.Types.ObjectId(input.orderId);
    const existingReservation =
      await GreenPointRedemptionReservation.findOne({ orderId }).session(
        session,
      );
    if (existingReservation) {
      if (existingReservation.status === "RELEASED") {
        throw new Error("Green Point redemption for this order was released.");
      }
      return GreenPointLedger.findOne({
        referenceKey: input.referenceKey,
      }).session(session);
    }

    const reserve = await lockReserveAccount(session);
    const [balance, liability, pendingRefundGp] = await Promise.all([
      getGreenPointBalance(input.userId, new Date(), session),
      getOutstandingLiability(new Date(), session),
      getPendingRefundAmount(session),
    ]);
    if (input.amount > balance) {
      throw new RangeError(
        `Insufficient Green Points: ${Math.max(0, balance)} GP available, ${input.amount} GP requested.`,
      );
    }
    if (
      reserve.balance <
      liability +
        pendingRefundGp +
        reserve.reservedRedemptions
    ) {
      throw new Error("Green Point redemption is temporarily unavailable because the reserve is insufficient.");
    }

    const account = await GreenPointReserveAccount.findOneAndUpdate(
      { _id: RESERVE_ID },
      {
        $inc: {
          reservedRedemptions: input.amount,
          revision: 1,
        },
      },
      { new: true, session },
    );
    if (!account) {
      throw new Error("Green Point redemption is temporarily unavailable because the reserve is insufficient.");
    }

    const [entry] = await GreenPointLedger.create(
      [
        {
          userId: new mongoose.Types.ObjectId(input.userId),
          type: "REDEEM",
          amount: -input.amount,
          description: "Green Points used at checkout",
          referenceKey: input.referenceKey,
        },
      ],
      { session },
    );
    await GreenPointRedemptionReservation.create(
      [
        {
          orderId,
          userId: new mongoose.Types.ObjectId(input.userId),
          amount: input.amount,
          status: "PENDING",
          referenceKey: input.referenceKey,
        },
      ],
      { session },
    );
    await GreenPointReserveLedger.create(
      [
        {
          type: "REDEMPTION_RESERVED",
          amount: input.amount,
          balanceDelta: 0,
          balanceAfter: account.balance,
          reservedRedemptionsAfter: account.reservedRedemptions,
          referenceKey: `reserve:${input.referenceKey}:reserved`,
          orderId,
        },
      ],
      { session },
    );
    return entry;
  });
}

export async function consumeReservedGreenPoints(input: {
  orderId: string;
  session: ClientSession;
}) {
  const orderId = new mongoose.Types.ObjectId(input.orderId);
  const reservation = await GreenPointRedemptionReservation.findOne({
    orderId,
  }).session(input.session);
  if (!reservation || reservation.status === "CONSUMED") return reservation;
  if (reservation.status === "RELEASED") return reservation;

  await lockReserveAccount(input.session);
  const updated = await GreenPointReserveAccount.findOneAndUpdate(
    {
      _id: RESERVE_ID,
      balance: { $gte: reservation.amount },
      reservedRedemptions: { $gte: reservation.amount },
    },
    {
      $inc: {
        balance: -reservation.amount,
        reservedRedemptions: -reservation.amount,
        revision: 1,
      },
    },
    { new: true, session: input.session },
  );
  if (!updated) {
    throw new Error("Reserved Green Points could not be consumed from the reserve.");
  }
  await GreenPointRedemptionReservation.updateOne(
    { _id: reservation._id, status: "PENDING" },
    { $set: { status: "CONSUMED", consumedAt: new Date() } },
    { session: input.session },
  );
  await GreenPointReserveLedger.create(
    [
      {
        type: "REDEMPTION",
        amount: reservation.amount,
        balanceDelta: -reservation.amount,
        balanceAfter: updated.balance,
        reservedRedemptionsAfter: updated.reservedRedemptions,
        referenceKey: `reserve:${reservation.referenceKey}:consumed`,
        orderId,
      },
    ],
    { session: input.session },
  );
  return reservation;
}

export async function restoreReservedGreenPoints(input: {
  userId: string;
  orderId: string;
  amount: number;
  referenceKey: string;
  description: string;
  session?: ClientSession;
}) {
  if (input.amount === 0) return null;
  validatePositiveAmount(input.amount, "Green Point restoration amount");

  return inTransaction(input.session, async (session) => {
    const existing = await GreenPointLedger.findOne({
      referenceKey: input.referenceKey,
    }).session(session);
    if (existing) return existing;

    const orderId = new mongoose.Types.ObjectId(input.orderId);
    const reservation = await GreenPointRedemptionReservation.findOne({
      orderId,
    }).session(session);

    if (reservation?.status === "PENDING") {
      await lockReserveAccount(session);
      const updated = await GreenPointReserveAccount.findOneAndUpdate(
        {
          _id: RESERVE_ID,
          reservedRedemptions: { $gte: reservation.amount },
        },
        {
          $inc: {
            reservedRedemptions: -reservation.amount,
            revision: 1,
          },
        },
        { new: true, session },
      );
      if (!updated) {
        throw new Error("Reserved Green Points could not be released.");
      }
      await GreenPointRedemptionReservation.updateOne(
        { _id: reservation._id, status: "PENDING" },
        { $set: { status: "RELEASED", releasedAt: new Date() } },
        { session },
      );
      await GreenPointReserveLedger.create(
        [
          {
            type: "REDEMPTION_RELEASED",
            amount: reservation.amount,
            balanceDelta: 0,
            balanceAfter: updated.balance,
            reservedRedemptionsAfter: updated.reservedRedemptions,
            referenceKey: `reserve:${reservation.referenceKey}:released`,
            orderId,
          },
        ],
        { session },
      );
    } else if (reservation?.status === "CONSUMED") {
      throw new Error("Consumed Green Points must be refunded through the refund workflow.");
    }

    const [entry] = await GreenPointLedger.create(
      [
        {
          userId: new mongoose.Types.ObjectId(input.userId),
          type: "REFUND",
          amount: input.amount,
          description: input.description,
          referenceKey: input.referenceKey,
          expiresAt: expiryFrom(new Date()),
        },
      ],
      { session },
    );
    return entry;
  });
}

export async function reverseOrderGreenPointRewards(input: {
  orderId: string;
  buyerId: string;
  sellerIds: string[];
  session: ClientSession;
}) {
  const entries = [
    {
      userId: input.buyerId,
      referenceKey: `purchase:${input.orderId}`,
      reversalKey: `purchase:${input.orderId}:reversal`,
      description: "Purchase reward reversed after full order refund",
    },
    ...Array.from(new Set(input.sellerIds)).map((userId) => ({
      userId,
      referenceKey: `purchase:${input.orderId}:seller:${userId}`,
      reversalKey: `purchase:${input.orderId}:seller:${userId}:reversal`,
      description: "Seller purchase reward reversed after full order refund",
    })),
  ];

  for (const entry of entries) {
    const pending = await PendingGreenPointCredit.findOne({
      referenceKey: entry.referenceKey,
      status: "PENDING_REWARD",
    }).session(input.session);
    if (pending) {
      await PendingGreenPointCredit.updateOne(
        { _id: pending._id, status: "PENDING_REWARD" },
        { $set: { status: "CANCELLED", cancelledAt: new Date() } },
        { session: input.session },
      );
    }

    const original = await GreenPointLedger.findOne({
      userId: entry.userId,
      referenceKey: entry.referenceKey,
      amount: { $gt: 0 },
    }).session(input.session);
    if (!original) continue;
    const existingReversal = await GreenPointLedger.findOne({
      referenceKey: entry.reversalKey,
    }).session(input.session);
    if (existingReversal) continue;

    await GreenPointLedger.create(
      [
        {
          userId: entry.userId,
          type: "REVERSAL",
          amount: -original.amount,
          description: entry.description,
          referenceKey: entry.reversalKey,
          expiresAt: original.expiresAt,
        },
      ],
      { session: input.session },
    );
  }
}

export async function topUpGreenPointReserve(input: {
  amount: number;
  referenceKey: string;
  actorId: string;
  externalReference?: string;
  evidenceUrl?: string;
  note?: string;
}) {
  validatePositiveAmount(input.amount, "Reserve top-up amount");
  if (!mongoose.Types.ObjectId.isValid(input.actorId)) {
    throw new Error("Invalid administrator ID for reserve top-up.");
  }
  if (!input.referenceKey.trim()) {
    throw new Error("Reserve top-up reference key is required.");
  }

  await inTransaction(undefined, async (session) => {
    const existing = await GreenPointReserveLedger.findOne({
      referenceKey: input.referenceKey,
    }).session(session);
    if (existing) {
      if (existing.type !== "ADMIN_TOP_UP" || existing.amount !== input.amount) {
        throw new Error("Reserve top-up reference key was already used.");
      }
      return;
    }

    await lockReserveAccount(session);
    const updated = await GreenPointReserveAccount.findOneAndUpdate(
      { _id: RESERVE_ID },
      { $inc: { balance: input.amount, revision: 1 } },
      { new: true, session },
    );
    if (!updated) throw new Error("Green Point reserve account is unavailable.");

    await GreenPointReserveLedger.create(
      [
        {
          type: "ADMIN_TOP_UP",
          amount: input.amount,
          balanceDelta: input.amount,
          balanceAfter: updated.balance,
          reservedRedemptionsAfter: updated.reservedRedemptions,
          referenceKey: input.referenceKey,
          actorId: new mongoose.Types.ObjectId(input.actorId),
          externalReference: input.externalReference,
          evidenceUrl: input.evidenceUrl,
          note: input.note,
        },
      ],
      { session },
    );
    await processPendingGreenPointCredits(session);
  });
  return getGreenPointReserveSnapshot();
}
