"use client";

import Link from "next/link";
import { ArrowLeft, Bell, Leaf, PackageCheck, ShieldAlert, Sparkles, WalletCards } from "lucide-react";
import { useSwapStore } from "@/store/useSwapStore";
import { formatShortDate } from "@/lib/format";

const icons = { wallet: WalletCards, order: PackageCheck, qc: ShieldAlert, match: Sparkles, donation: Leaf };

export default function NotificationsPage() {
  const donationNotifications = useSwapStore((state) => state.notifications);
  const allNotifications = [
    ...donationNotifications.map((notification) => ({
      ...notification,
      time: formatShortDate(notification.createdAt),
    })),
  ];

  return (
    <main className="px-4 pb-6 pt-5">
      <header className="mb-5 flex items-center gap-3"><Link href="/" aria-label="Back home" className="rounded-full p-2 text-ink-muted hover:bg-mint-50"><ArrowLeft size={20} /></Link><div><h1 className="text-xl font-semibold text-ink">Notifications</h1><p className="text-xs text-ink-muted">Important updates from your SwapIt activity</p></div><Bell className="ml-auto text-primary" size={20} /></header>
      <div className="space-y-2">
        {allNotifications.length === 0 ? <p className="rounded-2xl bg-mint-50 p-5 text-center text-sm text-ink-muted">No notifications yet.</p> : allNotifications.map((notification) => {
          const Icon = icons[notification.kind as keyof typeof icons];
          return (
            <Link key={notification.id} href={notification.href} className="flex items-start gap-3 rounded-2xl bg-white p-4 shadow-card hover:bg-mint-50">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-mint-50 text-primary"><Icon size={18} /></span>
              <span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><span className="text-xs font-semibold text-ink">{notification.title}</span><span className="shrink-0 text-[9px] text-ink-muted">{notification.time}</span></span><span className="mt-1 block text-[10px] leading-relaxed text-ink-muted">{notification.detail}</span></span>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
