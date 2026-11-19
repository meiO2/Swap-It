const BASIS_POINTS = BigInt(10_000);

export const BUYER_ADMIN_FEE_BPS = 300;
export const GATEWAY_BUDGET_BPS = 70;
export const SWAPIT_REVENUE_BPS = 150;
export const GP_POOL_BPS = 80;
export const MAX_GP_REDEMPTION_BPS = 3_000;

export type SellerSubtotal = {
  sellerId: string;
  subtotal: number;
};

function assertNonNegativeSafeInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer.`);
  }
}

function percentageNumerator(amount: number, basisPoints: number) {
  assertNonNegativeSafeInteger(amount, "Amount");
  if (!Number.isSafeInteger(basisPoints) || basisPoints < 0) {
    throw new RangeError("Percentage must be a non-negative integer.");
  }
  return BigInt(amount) * BigInt(basisPoints);
}

export function roundHalfUpPercent(amount: number, basisPoints: number) {
  const numerator = percentageNumerator(amount, basisPoints);
  const result = (numerator + BASIS_POINTS / BigInt(2)) / BASIS_POINTS;
  const value = Number(result);
  if (!Number.isSafeInteger(value)) {
    throw new RangeError("Calculated amount exceeds the safe integer range.");
  }
  return value;
}

export function floorPercent(amount: number, basisPoints: number) {
  const result = percentageNumerator(amount, basisPoints) / BASIS_POINTS;
  const value = Number(result);
  if (!Number.isSafeInteger(value)) {
    throw new RangeError("Calculated amount exceeds the safe integer range.");
  }
  return value;
}

export function calculateMaximumGpRedemption(productSubtotal: number) {
  return floorPercent(productSubtotal, MAX_GP_REDEMPTION_BPS);
}

export function calculateTransactionFinancials(input: {
  productSubtotal: number;
  cashProcessed?: number;
}) {
  const { productSubtotal, cashProcessed } = input;
  const buyerAdminFee = roundHalfUpPercent(
    productSubtotal,
    BUYER_ADMIN_FEE_BPS,
  );
  const gatewayBudget = roundHalfUpPercent(
    productSubtotal,
    GATEWAY_BUDGET_BPS,
  );
  const nominalSwapItRevenue = roundHalfUpPercent(
    productSubtotal,
    SWAPIT_REVENUE_BPS,
  );
  const gpPool = floorPercent(productSubtotal, GP_POOL_BPS);
  const roundingAdjustment =
    buyerAdminFee - gatewayBudget - nominalSwapItRevenue - gpPool;
  const swapItRevenueTarget = nominalSwapItRevenue + roundingAdjustment;

  if (swapItRevenueTarget < 0) {
    throw new RangeError("Rounding adjustment would make SwapIt revenue negative.");
  }

  const actualGatewayFee =
    cashProcessed === undefined
      ? undefined
      : roundHalfUpPercent(cashProcessed, GATEWAY_BUDGET_BPS);
  const gatewayBuffer =
    actualGatewayFee === undefined
      ? undefined
      : Math.max(0, gatewayBudget - actualGatewayFee);
  const gatewayShortfall =
    actualGatewayFee === undefined
      ? undefined
      : Math.max(0, actualGatewayFee - gatewayBudget);

  return {
    buyerAdminFee,
    gatewayBudget,
    nominalSwapItRevenue,
    swapItRevenueTarget,
    roundingAdjustment,
    gpPool,
    actualGatewayFee,
    gatewayBuffer,
    gatewayShortfall,
    retainedSwapItRevenue:
      gatewayShortfall === undefined
        ? undefined
        : swapItRevenueTarget - gatewayShortfall,
  };
}

export function splitGpPool(gpPool: number) {
  assertNonNegativeSafeInteger(gpPool, "Green Point pool");
  const buyer = Number((BigInt(gpPool) * BigInt(60)) / BigInt(100));
  return { buyer, seller: gpPool - buyer };
}

export function allocateSellerGp(
  sellerGp: number,
  sellers: ReadonlyArray<SellerSubtotal>,
) {
  assertNonNegativeSafeInteger(sellerGp, "Seller Green Points");
  const grouped = new Map<string, number>();
  for (const seller of sellers) {
    assertNonNegativeSafeInteger(seller.subtotal, "Seller subtotal");
    grouped.set(
      seller.sellerId,
      (grouped.get(seller.sellerId) ?? 0) + seller.subtotal,
    );
  }

  const entries = Array.from(grouped, ([sellerId, subtotal]) => ({
    sellerId,
    subtotal,
  }));
  const totalSubtotal = entries.reduce(
    (total, entry) => total + entry.subtotal,
    0,
  );
  if (!Number.isSafeInteger(totalSubtotal)) {
    throw new RangeError("Combined seller subtotal exceeds the safe integer range.");
  }
  if (sellerGp === 0 || totalSubtotal === 0) {
    return entries.map(({ sellerId }) => ({ sellerId, amount: 0 }));
  }

  let allocated = 0;
  const shares = entries.map(({ sellerId, subtotal }) => {
    const numerator = BigInt(sellerGp) * BigInt(subtotal);
    const denominator = BigInt(totalSubtotal);
    const amount = Number(numerator / denominator);
    allocated += amount;
    return {
      sellerId,
      amount,
      remainder: numerator % denominator,
    };
  });

  const remaining = sellerGp - allocated;
  shares.sort((left, right) => {
    if (left.remainder > right.remainder) return -1;
    if (left.remainder < right.remainder) return 1;
    return left.sellerId.localeCompare(right.sellerId);
  });
  for (let index = 0; index < remaining; index += 1) {
    shares[index].amount += 1;
  }

  return shares
    .map(({ sellerId, amount }) => ({ sellerId, amount }))
    .sort((left, right) => left.sellerId.localeCompare(right.sellerId));
}
