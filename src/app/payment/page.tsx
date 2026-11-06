"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Building2, CreditCard, QrCode, Store, WalletCards } from "lucide-react";
import { apiRequest } from "@/lib/api";
import { formatRupiah } from "@/lib/format";

type PaymentMethod =
  | "bca_va" | "bni_va" | "bri_va" | "mandiri_va" | "permata_va"
  | "qris" | "gopay" | "shopeepay" | "indomaret" | "alfamart" | "credit_card";

type PaymentResponse = {
  paymentData?: {
    va_numbers?: Array<{ bank: string; va_number: string }>;
    permata_va_number?: string;
    bill_key?: string;
    biller_code?: string;
    actions?: Array<{ name: string; method: string; url: string }>;
  };
  grossAmount: number;
};

const methods: Array<{ id: PaymentMethod; label: string; group: string }> = [
  { id: "bca_va", label: "BCA Virtual Account", group: "Virtual Account" },
  { id: "bni_va", label: "BNI Virtual Account", group: "Virtual Account" },
  { id: "bri_va", label: "BRI Virtual Account", group: "Virtual Account" },
  { id: "mandiri_va", label: "Mandiri Virtual Account", group: "Virtual Account" },
  { id: "permata_va", label: "Permata Virtual Account", group: "Virtual Account" },
  { id: "qris", label: "QRIS", group: "E-Wallet" },
  { id: "gopay", label: "GoPay", group: "E-Wallet" },
  { id: "shopeepay", label: "ShopeePay", group: "E-Wallet" },
  { id: "credit_card", label: "Credit / Debit Card", group: "Card" },
  { id: "indomaret", label: "Indomaret", group: "Over the Counter" },
  { id: "alfamart", label: "Alfamart", group: "Over the Counter" },
];

export default function PaymentPage() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId");
  const [selected, setSelected] = useState<PaymentMethod>("bca_va");
  const [card, setCard] = useState({ number: "", cvv: "", month: "", year: "" });
  const [payment, setPayment] = useState<PaymentResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function pay() {
    if (!orderId) {
      setError("Order ID is missing.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      let tokenId: string | undefined;
      if (selected === "credit_card") {
        const clientKey = process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY;
        if (!clientKey) throw new Error("Midtrans client key is not configured.");
        const tokenResponse = await fetch(
          `${process.env.NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION === "true" ? "https://api.midtrans.com" : "https://api.sandbox.midtrans.com"}/v2/token`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              client_key: clientKey,
              card_number: card.number.replace(/\s/g, ""),
              card_cvv: card.cvv,
              card_exp_month: card.month,
              card_exp_year: card.year,
            }),
          },
        );
        const token = (await tokenResponse.json()) as { token_id?: string; error_messages?: string[] };
        if (!tokenResponse.ok || !token.token_id) {
          throw new Error(token.error_messages?.join(", ") ?? "Could not tokenize card.");
        }
        tokenId = token.token_id;
      }
      const result = await apiRequest<PaymentResponse>("/api/payments", {
        method: "POST",
        body: JSON.stringify({ orderId, paymentMethod: selected, tokenId }),
      });
      setPayment(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Payment could not be created.");
    } finally {
      setLoading(false);
    }
  }

  const action = payment?.paymentData?.actions?.find((item) => item.name === "generate-qr-code" || item.name === "deeplink-redirect");

  return (
    <main className="min-h-dvh px-4 pb-8 pt-5">
      <header className="mb-5 flex items-center gap-3">
        <Link href={orderId ? `/orders/${orderId}` : "/orders"} aria-label="Back to order" className="flex size-11 items-center justify-center rounded-full text-ink-muted hover:bg-mint-50">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-ink">Choose payment method</h1>
          <p className="text-xs text-ink-muted">Secure payment powered by Midtrans</p>
        </div>
      </header>

      <section className="rounded-3xl bg-white p-4 shadow-card">
        {["Virtual Account", "E-Wallet", "Card", "Over the Counter"].map((group) => (
          <div key={group} className="mb-5 last:mb-0">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{group}</h2>
            <div className="grid gap-2">
              {methods.filter((method) => method.group === group).map((method) => (
                <button key={method.id} type="button" onClick={() => setSelected(method.id)} className={`flex min-h-12 items-center gap-3 rounded-2xl border px-3 text-left text-sm ${selected === method.id ? "border-primary bg-mint-50 text-primary" : "border-border text-ink"}`}>
                  {method.group === "Virtual Account" ? <Building2 size={18} /> : method.group === "E-Wallet" ? <WalletCards size={18} /> : method.group === "Card" ? <CreditCard size={18} /> : <Store size={18} />}
                  <span className="font-medium">{method.label}</span>
                </button>
              ))}
            </div>
          </div>
        ))}

        {selected === "credit_card" && (
          <div className="mt-4 space-y-3 rounded-2xl bg-mint-50 p-3">
            <input className="form-input" placeholder="Card number" value={card.number} onChange={(event) => setCard({ ...card, number: event.target.value })} inputMode="numeric" />
            <div className="grid grid-cols-3 gap-2">
              <input className="form-input" placeholder="MM" value={card.month} onChange={(event) => setCard({ ...card, month: event.target.value })} inputMode="numeric" />
              <input className="form-input" placeholder="YY" value={card.year} onChange={(event) => setCard({ ...card, year: event.target.value })} inputMode="numeric" />
              <input className="form-input" placeholder="CVV" value={card.cvv} onChange={(event) => setCard({ ...card, cvv: event.target.value })} inputMode="numeric" type="password" />
            </div>
          </div>
        )}

        {error && <p role="alert" className="mt-4 rounded-xl bg-danger/10 p-3 text-xs text-danger">{error}</p>}
        {payment && (
          <div className="mt-4 rounded-2xl bg-mint-50 p-4 text-sm text-ink">
            <p className="font-semibold">Payment created</p>
            <p className="mt-1 text-xs text-ink-muted">Amount: {formatRupiah(payment.grossAmount)}</p>
            {payment.paymentData?.va_numbers?.map((item) => <p key={item.va_number} className="mt-3 font-semibold">{item.bank.toUpperCase()} VA: {item.va_number}</p>)}
            {payment.paymentData?.permata_va_number && <p className="mt-3 font-semibold">Permata VA: {payment.paymentData.permata_va_number}</p>}
            {payment.paymentData?.bill_key && <p className="mt-3 font-semibold">Bill key: {payment.paymentData.bill_key}</p>}
            {action && <a className="mt-3 inline-flex items-center gap-2 font-semibold text-primary" href={action.url} target="_blank" rel="noreferrer">{action.name === "generate-qr-code" ? <QrCode size={16} /> : <WalletCards size={16} />} Open payment</a>}
            <Link href={`/payment/result?orderId=${orderId}`} className="mt-4 block text-xs font-semibold text-primary">Check payment status</Link>
          </div>
        )}

        {!payment && <button type="button" onClick={() => void pay()} disabled={loading} className="mt-5 h-12 w-full rounded-full bg-primary text-sm font-semibold text-white shadow-primary disabled:opacity-60">{loading ? "Creating payment..." : "Continue payment"}</button>}
      </section>
    </main>
  );
}
