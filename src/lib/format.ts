export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatGP(amount: number): string {
  return `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(amount)} GP`;
}

export function formatShortDate(date: string): string {
  return new Intl.DateTimeFormat("en-ID", { day: "numeric", month: "short", year: "numeric" }).format(new Date(date));
}
