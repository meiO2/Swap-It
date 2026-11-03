export const QR_TTL_SECONDS = 300;
export const GP_PER_ITEM = 100;
export const MAX_DONATION_ITEMS = 30;

export function createDonationCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const values = new Uint32Array(8);
  crypto.getRandomValues(values);
  const code = Array.from(values, (value) => alphabet[value % alphabet.length]).join("");
  return `SWP-${code.slice(0, 4)}-${code.slice(4)}`;
}

export function getExpiryDate(earnedAt: Date): Date {
  return new Date(earnedAt.getFullYear(), 11, 31, 23, 59, 59, 999);
}
