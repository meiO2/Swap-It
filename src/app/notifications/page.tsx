"use client";

import Link from "next/link";
import { ArrowLeft, Bell, Leaf, PackageCheck, ShieldAlert, Sparkles, WalletCards } from "lucide-react";
import { useSwapStore } from "@/store/useSwapStore";
import { formatShortDate } from "@/lib/format";

const notifications = [
  { id: "expiry", title: "Green Points expiring soon", detail: "Some points expire within 30 days. Use them before they go.", time: "Today", href: "/wallet", kind: "wallet" },
  { id: "order", title: "Your order is being processed", detail: "Your preloved order has been confirmed.", time: "Yesterday", href: "/orders", kind: "order" },
  { id: "qc", title: "QC report needs your attention", detail: "Choose what happens next within 3 days.", time: "Today", href: "/qc-report/order-qc-demo", kind: "qc" },
  { id: "match", title: "It’s a match!", detail: "Someone liked one of your pieces. Start a conversation.", time: "Mon", href: "/chat", kind: "match" },
];

const icons = { wallet: WalletCards, order: PackageCheck, qc: ShieldAlert, match: Sparkles, donation: Leaf };

export default function NotificationsPage() {
  const donationNotifications = useSwapStore((state) => state.notifications);
  const allNotifications = [
    ...donationNotifications.map((notification) => ({
      ...notification,
      time: formatShortDate(notification.createdAt),
    })),
    ...notifications,
  ];

  return (
    <main className="px-4 pb-6 pt-5">
      <header className="mb-5 flex items-center gap-3"><Link href="/" aria-label="Back home" className="rounded-full p-2 text-ink-muted hover:bg-mint-50"><ArrowLeft size={20} /></Link><div><h1 className="text-xl font-semibold text-ink">Notifications</h1><p className="text-xs text-ink-muted">Important updates from your SwapIt activity</p></div><Bell className="ml-auto text-primary" size={20} /></header>
      <div className="space-y-2">
        {allNotifications.map((notification) => {
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
