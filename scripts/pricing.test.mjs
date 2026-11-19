import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateBuyerServiceFee,
  calculateSellerFeeSnapshots,
} from "../src/lib/fees.ts";
import {
  allocateSellerGp,
  calculateMaximumGpRedemption,
  calculateTransactionFinancials,
  splitGpPool,
} from "../src/lib/financial-model.ts";
import {
  calculateSellerRecoveryAmount,
  calculateSellerSettlement,
} from "../src/lib/seller-settlement-calculations.ts";
import { formatGP, formatPrice, parseListingPrice } from "../src/lib/format.ts";

test("listing prices preserve whole rupiah and reject ambiguous input", () => {
  for (const [input, price] of [
    ["50000", 50_000],
    ["50.000", 50_000],
    ["80.000", 80_000],
    ["1.000.000", 1_000_000],
  ]) {
    assert.equal(parseListingPrice(input), price);
    const formattedNumber = input.includes(".") ? input : "50.000";
    assert.equal(formatPrice(price), `Rp${formattedNumber}`);
  }
  for (const input of ["", "0", "50.00", "50,000", "-50000", "9007199254740992"]) {
    assert.equal(parseListingPrice(input), null);
  }
  assert.equal(formatGP(50_000), "50.000 GP");
});

test("buyer administration fee is 3 percent rounded half up", () => {
  assert.equal(calculateBuyerServiceFee(0), 0);
  assert.equal(calculateBuyerServiceFee(50_000), 1_500);
  assert.equal(calculateBuyerServiceFee(80_000), 2_400);
  assert.equal(calculateBuyerServiceFee(1_000_000), 30_000);
  assert.equal(calculateBuyerServiceFee(5_501), 165);
});

test("seller fees are recorded once per seller per order", () => {
  const snapshots = calculateSellerFeeSnapshots([
    { sellerId: "a", price: 4_000 },
    { sellerId: "b", price: 80_000 },
    { sellerId: "a", price: 1_500 },
    { sellerId: "c", price: 5_499 },
  ]);
  assert.deepEqual(snapshots, [
    { sellerId: "a", subtotal: 5_500, transactionFee: 5_500, netAmount: 0 },
    { sellerId: "b", subtotal: 80_000, transactionFee: 5_500, netAmount: 74_500 },
    { sellerId: "c", subtotal: 5_499, transactionFee: 5_500, netAmount: -1 },
  ]);
});

test("transaction financial model matches the full-cash and 30-percent GP examples", () => {
  const fullCash = calculateTransactionFinancials({
    productSubtotal: 100_000,
    cashProcessed: 103_000,
  });
  assert.deepEqual(fullCash, {
    buyerAdminFee: 3_000,
    gatewayBudget: 700,
    nominalSwapItRevenue: 1_500,
    swapItRevenueTarget: 1_500,
    roundingAdjustment: 0,
    gpPool: 800,
    actualGatewayFee: 721,
    gatewayBuffer: 0,
    gatewayShortfall: 21,
    retainedSwapItRevenue: 1_479,
  });

  const partialGp = calculateTransactionFinancials({
    productSubtotal: 100_000,
    cashProcessed: 73_000,
  });
  assert.equal(partialGp.actualGatewayFee, 511);
  assert.equal(partialGp.gatewayBuffer, 189);
  assert.equal(partialGp.retainedSwapItRevenue, 1_500);
  assert.equal(calculateMaximumGpRedemption(100_000), 30_000);
});

test("GP splits and largest-remainder seller allocation preserve the full pool", () => {
  const split = splitGpPool(801);
  assert.deepEqual(split, { buyer: 480, seller: 321 });
  const sellerShares = allocateSellerGp(split.seller, [
    { sellerId: "seller-b", subtotal: 40_000 },
    { sellerId: "seller-a", subtotal: 60_000 },
  ]);
  assert.deepEqual(sellerShares, [
    { sellerId: "seller-a", amount: 193 },
    { sellerId: "seller-b", amount: 128 },
  ]);
  assert.equal(sellerShares.reduce((sum, item) => sum + item.amount, 0), split.seller);
});

test("seller settlement tracks outstanding payable and returned overpayment separately", () => {
  assert.deepEqual(
    calculateSellerSettlement({
      payableAmount: 100,
      totalPaid: 60,
      overpaymentReturned: 0,
    }),
    {
      outstandingPayable: 40,
      overpaymentAmount: 0,
      outstandingOverpayment: 0,
      status: "PARTIALLY_SETTLED",
    },
  );
  assert.deepEqual(
    calculateSellerSettlement({
      payableAmount: 100,
      totalPaid: 120,
      overpaymentReturned: 8,
    }),
    {
      outstandingPayable: 0,
      overpaymentAmount: 20,
      outstandingOverpayment: 12,
      status: "OVERPAID",
    },
  );
  assert.equal(
    calculateSellerSettlement({
      payableAmount: 100,
      totalPaid: 120,
      overpaymentReturned: 20,
    }).status,
    "SETTLED",
  );
  assert.equal(
    calculateSellerRecoveryAmount({
      totalPaid: 120,
      overpaymentReturned: 20,
    }),
    100,
  );
  assert.equal(
    calculateSellerRecoveryAmount({
      totalPaid: 60,
      overpaymentReturned: 0,
    }),
    60,
  );
  assert.equal(
    calculateSellerSettlement({
      payableAmount: 0,
      totalPaid: 0,
      overpaymentReturned: 0,
    }).status,
    "SETTLED",
  );
  assert.throws(
    () =>
      calculateSellerSettlement({
        payableAmount: 100,
        totalPaid: 120,
        overpaymentReturned: 21,
      }),
    /exceeds the actual overpayment/,
  );
});
