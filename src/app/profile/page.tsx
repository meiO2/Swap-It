"use client";

import Image from "next/image";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { ArrowRight, Heart, ListChecks, PackageCheck, Settings2, WalletCards } from "lucide-react";
import { swapItUser } from "@/data/mock";
import { formatGP } from "@/lib/format";
import { useSwapStore } from "@/store/useSwapStore";

const links = [
  { label: "My listings", detail: "Manage your listings and QC", href: "/listings", Icon: ListChecks },
  { label: "My orders", detail: "Track purchases and swaps", href: "/orders", Icon: PackageCheck },
  { label: "Green Point wallet", detail: "Balance, expiry, and activity", href: "/wallet", Icon: WalletCards },
  { label: "Settings", detail: "Profile and app preferences", href: "#settings", Icon: Settings2 },
];

export default function ProfilePage() {
  const batches = useSwapStore((state) => state.pointBatches);
  const balance = batches.reduce((total, batch) => total + batch.remaining, 0);

  return (
    <main className="space-y-5 px-4 pb-6 pt-5">
      <header><p className="text-xs font-medium uppercase tracking-[0.12em] text-primary">Your SwapIt space</p><h1 className="mt-1 text-xl font-semibold text-ink">Profile</h1></header>
      <section className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-card">
        <div className="relative size-16 overflow-hidden rounded-full bg-mint-50"><Image src={swapItUser.avatar} alt={`${swapItUser.name} profile`} fill sizes="64px" className="object-cover" /></div>
        <div className="min-w-0 flex-1"><h2 className="text-base font-semibold text-ink">{swapItUser.name}</h2><p className="mt-1 text-xs text-ink-muted">Member since {swapItUser.memberSince}</p><p className="mt-2 flex items-center gap-1 text-xs font-semibold text-primary"><Heart size={13} fill="currentColor" /> {formatGP(balance)}</p></div>
      </section>
      <Link href="/wallet" className="flex items-center justify-between rounded-2xl bg-primary p-4 text-white shadow-primary">
        <div><p className="text-xs text-white/85">Green Point balance</p><p className="mt-1 text-xl font-bold">{formatGP(balance)}</p></div><span className="flex size-9 items-center justify-center rounded-full bg-white/20"><ArrowRight size={19} /></span>
      </Link>
      <section className="flex items-center gap-4 rounded-2xl bg-mint-100 p-4">
        <div className="rounded-xl bg-white p-2"><QRCodeSVG value={swapItUser.qrValue} size={82} title="Your unique SwapIt QR code" /></div>
        <div className="flex-1"><h2 className="text-sm font-semibold text-ink">Your donation QR</h2><p className="mt-1 text-xs leading-relaxed text-ink-muted">Scan at a Swap Hub to donate clothes and earn points.</p><Link href="/donate" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary">Open donation <ArrowRight size={13} /></Link></div>
      </section>
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
    </main>
  );
}
