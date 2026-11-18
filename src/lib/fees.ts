export const BUYER_SERVICE_FEE_RATE = 0.025;
export const SELLER_TRANSACTION_FEE = 5_500;
export const SELLER_MINIMUM_MESSAGE =
  "The total for each seller must be at least Rp5.500. Add more items from that seller or remove their items.";

export function calculateBuyerServiceFee(subtotal: number) {
  return Math.round(subtotal * BUYER_SERVICE_FEE_RATE);
}

export function calculateSellerFeeSnapshots(
  items: ReadonlyArray<{ sellerId: string; price: number }>,
) {
  const totals = new Map<string, number>();
  for (const item of items) {
    totals.set(item.sellerId, (totals.get(item.sellerId) ?? 0) + item.price);
  }
  return Array.from(totals, ([sellerId, subtotal]) => ({
    sellerId,
    subtotal,
    transactionFee: SELLER_TRANSACTION_FEE,
    netAmount: subtotal - SELLER_TRANSACTION_FEE,
  }));
}
