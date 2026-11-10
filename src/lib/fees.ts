export const BUYER_SERVICE_FEE_RATE = 0.025;
export const BUYER_SERVICE_FEE_MIN = 2_000;
export const BUYER_SERVICE_FEE_MAX = 10_000;

export function calculateBuyerServiceFee(subtotal: number) {
  return Math.min(
    Math.max(
      Math.round(subtotal * BUYER_SERVICE_FEE_RATE),
      BUYER_SERVICE_FEE_MIN,
    ),
    BUYER_SERVICE_FEE_MAX,
  );
}
