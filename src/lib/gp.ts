export type PointBatch = {
  id: string;
  remaining: number;
  earnedAt: string;
  expiresAt: string;
};

export function createPointBatch(id: string, amount: number, earnedAt = new Date()): PointBatch {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new RangeError("Point batch amount must be a non-negative number.");
  }
  const expiresAt = new Date(earnedAt);
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);
  return { id, remaining: amount, earnedAt: earnedAt.toISOString(), expiresAt: expiresAt.toISOString() };
}

export function spendPointsFEFO(batches: PointBatch[], amount: number): PointBatch[] {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new RangeError("Points to spend must be a non-negative number.");
  }
  return spendPointsFEFOAt(batches, amount, new Date());
}

export function getAvailablePointBalance(batches: PointBatch[], now: Date): number {
  return batches.reduce((total, batch) => total + (Date.parse(batch.expiresAt) > now.getTime() ? batch.remaining : 0), 0);
}

export function spendPointsFEFOAt(batches: PointBatch[], amount: number, now: Date): PointBatch[] {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new RangeError("Points to spend must be a non-negative number.");
  }
  const activeBatches = batches.filter((batch) => Date.parse(batch.expiresAt) > now.getTime());
  const expiredBatches = batches.filter((batch) => Date.parse(batch.expiresAt) <= now.getTime());
  const available = activeBatches.reduce((total, batch) => total + batch.remaining, 0);
  if (amount > available) {
    throw new RangeError(`Insufficient Green Points: ${available} GP available, ${amount} GP requested.`);
  }

  let remainingToSpend = amount;
  const orderedBatches = [...activeBatches].sort((a, b) => Date.parse(a.expiresAt) - Date.parse(b.expiresAt));
  const updated = orderedBatches.map((batch) => {
    const spent = Math.min(batch.remaining, remainingToSpend);
    remainingToSpend -= spent;
    return { ...batch, remaining: batch.remaining - spent };
  });
  return [...updated.filter((batch) => batch.remaining > 0), ...expiredBatches];
}

export function getExpiringBatches(batches: PointBatch[], withinDays: number, now: Date): PointBatch[] {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() + withinDays);
  return batches.filter((batch) => {
    const expiry = Date.parse(batch.expiresAt);
    return batch.remaining > 0 && expiry >= now.getTime() && expiry <= cutoff.getTime();
  });
}

export function calculatePurchaseReward(productValue: number): number {
  if (!Number.isFinite(productValue) || productValue < 0) {
    throw new RangeError("Product value must be a non-negative number.");
  }
  // TODO: Confirm how fractional GP rewards should be rounded.
  return Math.floor(productValue * 0.02);
}
