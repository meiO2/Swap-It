import mongoose, { type ClientSession } from "mongoose";
import {
  allocateSellerGp,
  calculateTransactionFinancials,
  floorPercent,
  splitGpPool,
} from "@/lib/financial-model";
import { calculateSellerFeeSnapshots } from "@/lib/fees";
import { awardGreenPoints } from "@/lib/green-points";
import { calculateSellerSettlement } from "@/lib/seller-settlement-calculations";
import type { IOrder } from "@/models/Order";
import SellerPayable from "@/models/SellerPayable";
import Order from "@/models/Order";
import Refund from "@/models/Refund";
import BuyerRefundEntitlement from "@/models/BuyerRefundEntitlement";
import { touchSettlementOrderFence } from "@/lib/settlement-order-fence";
import { recordSettlementMutation } from "@/lib/settlement-mutation";

function getSellerSnapshots(order: IOrder) {
  if (order.sellerFeeSnapshots?.length) {
    return order.sellerFeeSnapshots.map((snapshot) => ({
      sellerId: snapshot.sellerId.toString(),
      subtotal: snapshot.subtotal,
      transactionFee: snapshot.transactionFee,
      netAmount: snapshot.netAmount,
      gpReward: snapshot.gpReward,
    }));
  }

  return calculateSellerFeeSnapshots(
    order.items.map((item) => ({
      sellerId: item.sellerId.toString(),
      price: item.price,
    })),
  ).map((snapshot) => ({ ...snapshot, gpReward: undefined }));
}

export async function createSellerPayablesForCompletedOrder(
  completedOrder: IOrder & { _id: mongoose.Types.ObjectId },
  session: ClientSession,
) {
  await touchSettlementOrderFence(completedOrder._id, session);
  const order = await Order.findById(completedOrder._id).session(session);
  if (!order || order.status !== "COMPLETED") {
    throw new Error("Seller payables require a completed order.");
  }
  if (await BuyerRefundEntitlement.exists({ orderId: order._id }).session(session) ||
    await Refund.exists({
      orderId: order._id,
      status: { $in: ["APPROVED", "PROCESSING", "PARTIALLY_COMPLETED", "COMPLETED"] },
    }).session(session)) {
    throw new Error("Seller payables cannot be created while an order refund is in progress.");
  }
  const snapshots = getSellerSnapshots(order);
  const financial =
    order.financialSnapshot ??
    calculateTransactionFinancials({ productSubtotal: order.subtotal });
  const split = splitGpPool(
    financial.gpPool ?? floorPercent(order.subtotal, 80),
  );
  const sellerGp = allocateSellerGp(
    split.seller,
    snapshots.map(({ sellerId, subtotal }) => ({ sellerId, subtotal })),
  );
  const sellerGpById = new Map(
    sellerGp.map((allocation) => [allocation.sellerId, allocation.amount]),
  );

  for (const snapshot of snapshots) {
    const initialSettlement = calculateSellerSettlement({
      payableAmount: snapshot.netAmount,
      totalPaid: 0,
      overpaymentReturned: 0,
    });
    const creation = await SellerPayable.updateOne(
      {
        orderId: order._id,
        sellerId: new mongoose.Types.ObjectId(snapshot.sellerId),
      },
      {
        $setOnInsert: {
          orderId: order._id,
          sellerId: new mongoose.Types.ObjectId(snapshot.sellerId),
          sellerSubtotal: snapshot.subtotal,
          transactionFee: snapshot.transactionFee,
          payableAmount: snapshot.netAmount,
          totalPaid: 0,
          overpaymentReturned: 0,
          ledgerBaseline: "ZERO_AT_CREATION",
          status: initialSettlement.status,
          settledAt:
            initialSettlement.status === "SETTLED" ? new Date() : undefined,
        },
      },
      { upsert: true, session },
    );
    if (creation.upsertedId) {
      await recordSettlementMutation({
        session,
        payableIds: [creation.upsertedId],
        reason: "Seller payable created for completed order.",
      });
    }

    const reward = snapshot.gpReward ?? sellerGpById.get(snapshot.sellerId) ?? 0;
    if (reward > 0) {
      await awardGreenPoints({
        userId: snapshot.sellerId,
        amount: reward,
        description: "Completed marketplace seller reward",
        referenceKey: `purchase:${order._id.toString()}:seller:${snapshot.sellerId}`,
        source: "PURCHASE",
        orderId: order._id.toString(),
        session,
      });
    }
  }

  const buyerReward =
    order.financialSnapshot?.buyerGpReward ?? split.buyer;
  if (buyerReward > 0) {
    await awardGreenPoints({
      userId: order.buyerId.toString(),
      amount: buyerReward,
      description: "Completed marketplace purchase reward",
      referenceKey: `purchase:${order._id.toString()}`,
      source: "PURCHASE",
      orderId: order._id.toString(),
      session,
    });
  }
}

