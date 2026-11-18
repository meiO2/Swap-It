import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateBuyerServiceFee,
  calculateSellerFeeSnapshots,
} from "../src/lib/fees.ts";
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

test("buyer fee is 2.5 percent without the old minimum or maximum", () => {
  assert.equal(calculateBuyerServiceFee(0), 0);
  assert.equal(calculateBuyerServiceFee(50_000), 1_250);
  assert.equal(calculateBuyerServiceFee(80_000), 2_000);
  assert.equal(calculateBuyerServiceFee(1_000_000), 25_000);
  assert.equal(calculateBuyerServiceFee(5_501), 138);
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
