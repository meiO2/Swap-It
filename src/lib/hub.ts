export const QR_TTL_SECONDS = 300;
export const MAX_DONATION_ITEMS = 30;

export function getExpiryDate(earnedAt: Date): Date {
  return new Date(earnedAt.getFullYear(), 11, 31, 23, 59, 59, 999);
}
