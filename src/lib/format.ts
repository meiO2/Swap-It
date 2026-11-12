export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatPrice(amount: number): string {
  return `Rp${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(amount)}`;
}

export function parseListingPrice(value: string): number | null {
  const trimmed = value.trim();
  if (!/^(?:\d+|[1-9]\d{0,2}(?:\.\d{3})+)$/.test(trimmed)) return null;
  const price = Number(trimmed.replace(/\./g, ""));
  return Number.isSafeInteger(price) && price > 0 ? price : null;
}

export function formatGP(amount: number): string {
  return `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(amount)} GP`;
}

export function formatShortDate(date: string): string {
  return new Intl.DateTimeFormat("en-ID", { day: "numeric", month: "short", year: "numeric" }).format(new Date(date));
}
