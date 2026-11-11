"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useEffect } from "react";
import { ArrowRight, Heart, ListChecks, LogOut, PackageCheck, ReceiptText, Settings2, WalletCards } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { formatGP } from "@/lib/format";
import { useSwapStore } from "@/store/useSwapStore";
import { apiRequest } from "@/lib/api";

const links = [
  { label: "Favorites", detail: "Clothes you saved to revisit", href: "/favorites", Icon: Heart },
  { label: "Revamp offers", detail: "Decide on eligible unsold listings", href: "/revamp/offers", Icon: PackageCheck },
  { label: "My listings", detail: "Manage your listings and QC", href: "/listings", Icon: ListChecks },
  { label: "My orders", detail: "Track purchases and swaps", href: "/orders", Icon: PackageCheck },
  { label: "Payment history", detail: "View Xendit transactions", href: "/payments", Icon: ReceiptText },
  { label: "Green Point wallet", detail: "Balance, expiry, and activity", href: "/wallet", Icon: WalletCards },
  { label: "Settings", detail: "Profile and saved addresses", href: "/profile/settings", Icon: Settings2 },
];

export default function ProfilePage() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const batches = useSwapStore((state) => state.pointBatches);
  const [ledgerBalance, setLedgerBalance] = useState<number | null>(null);
  const balance = ledgerBalance ?? batches.reduce((total, batch) => total + batch.remaining, 0);
  const [error, setError] = useState("");
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      apiRequest<{ balance: number }>("/api/green-points")
        .then((data) => setLedgerBalance(data.balance))
        .catch((reason: unknown) => console.error("Could not load Green Point balance.", reason));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function handleSignOut() {
    setSigningOut(true);
    setError("");
    try {
      await signOut();
      router.replace("/login");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not sign out. Please try again.");
      setSigningOut(false);
    }
  }

  return (
    <main className="space-y-5 px-4 pb-6 pt-5">
      <header><p className="text-xs font-medium uppercase tracking-[0.12em] text-primary">Your SwapIt space</p><h1 className="mt-1 text-xl font-semibold text-ink">Profile</h1></header>
      <section className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-card">
        <div aria-hidden="true" className="flex size-16 shrink-0 items-center justify-center rounded-full bg-mint-100 text-lg font-bold text-primary">{user?.name.slice(0, 1).toUpperCase() ?? "?"}</div>
        <div className="min-w-0 flex-1"><h2 className="text-base font-semibold text-ink">{user?.name ?? "Your account"}</h2><p className="mt-1 truncate text-xs text-ink-muted">{user?.email}</p><p className="mt-2 flex items-center gap-1 text-xs font-semibold text-primary"><Heart size={13} fill="currentColor" /> {formatGP(balance)}</p></div>
      </section>
      <Link href="/wallet" className="flex items-center justify-between rounded-2xl bg-primary p-4 text-white shadow-primary">
        <div><p className="text-xs text-white/85">Green Point balance</p><p className="mt-1 text-xl font-bold">{formatGP(balance)}</p></div><span className="flex size-9 items-center justify-center rounded-full bg-white/20"><ArrowRight size={19} /></span>
      </Link>
      <nav aria-label="Profile menu" className="overflow-hidden rounded-2xl bg-white shadow-card">
        {links.map(({ label, detail, href, Icon }, index) => (
          <Link key={label} href={href} className={`flex items-center gap-3 p-4 hover:bg-mint-50 ${index ? "border-t border-border" : ""}`}>
            <span className="flex size-9 items-center justify-center rounded-full bg-mint-50 text-primary"><Icon size={18} /></span>
            <span className="min-w-0 flex-1"><span className="block text-xs font-semibold text-ink">{label}</span><span className="mt-0.5 block text-[10px] text-ink-muted">{detail}</span></span>
            <ArrowRight size={15} className="text-ink-muted" />
          </Link>
        ))}
      </nav>
      <div className="rounded-2xl bg-mint-50 p-4"><h2 className="text-sm font-semibold text-ink">Be part of the circular wardrobe</h2><p className="mt-1 text-xs text-ink-muted">Discover the impact your community is making.</p><Link href="/news" className="mt-2 inline-block text-xs font-semibold text-primary">Read Swap News →</Link></div>
      {error && <p role="alert" className="rounded-xl bg-danger/10 p-3 text-xs text-danger">{error}</p>}
      <button type="button" onClick={handleSignOut} disabled={signingOut} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-danger/30 text-sm font-semibold text-danger disabled:opacity-60"><LogOut size={16} />{signingOut ? "Signing out…" : "Sign out"}</button>
    </main>
  );
}
