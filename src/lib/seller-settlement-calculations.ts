import type { SellerPayableStatus } from "@/models/SellerPayable";

export function calculateSellerSettlement(input: {
  payableAmount: number;
  totalPaid: number;
  overpaymentReturned: number;
}) {
  const { payableAmount, totalPaid, overpaymentReturned } = input;
  for (const [label, amount] of [
    ["Payable amount", payableAmount],
    ["Total paid", totalPaid],
    ["Overpayment returned", overpaymentReturned],
  ] as const) {
    if (!Number.isSafeInteger(amount) || amount < 0) {
      throw new RangeError(`${label} must be a non-negative safe integer.`);
    }
  }

  const overpaymentAmount = Math.max(0, totalPaid - payableAmount);
  if (overpaymentReturned > overpaymentAmount) {
    throw new RangeError("Overpayment return exceeds the actual overpayment.");
  }
  const outstandingPayable = Math.max(0, payableAmount - totalPaid);
  const outstandingOverpayment = overpaymentAmount - overpaymentReturned;
  let status: SellerPayableStatus;
  if (outstandingPayable > 0) {
    status = totalPaid === 0 ? "PENDING" : "PARTIALLY_SETTLED";
  } else if (outstandingOverpayment > 0) {
    status = "OVERPAID";
  } else {
    status = "SETTLED";
  }

  return {
    outstandingPayable,
    overpaymentAmount,
    outstandingOverpayment,
    status,
  };
}

export function calculateSellerRecoveryAmount(input: {
  totalPaid: number;
  overpaymentReturned: number;
}) {
  const { totalPaid, overpaymentReturned } = input;
  for (const [label, amount] of [
    ["Total paid", totalPaid],
    ["Overpayment returned", overpaymentReturned],
  ] as const) {
    if (!Number.isSafeInteger(amount) || amount < 0) {
      throw new RangeError(`${label} must be a non-negative safe integer.`);
    }
  }
  if (overpaymentReturned > totalPaid) {
    throw new RangeError("Overpayment return cannot exceed total paid.");
  }
  return totalPaid - overpaymentReturned;
}
