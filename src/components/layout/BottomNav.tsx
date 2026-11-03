"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Heart, Home, Newspaper, Plus, UserRound, X } from "lucide-react";

const destinations = [
  { label: "Home", href: "/", Icon: Home },
  { label: "Swap", href: "/swap", Icon: Heart },
  { label: "News", href: "/news", Icon: Newspaper },
  { label: "Profile", href: "/profile", Icon: UserRound },
];

export default function BottomNav() {
  const pathname = usePathname();
  const [isActionSheetOpen, setIsActionSheetOpen] = useState(false);

  return (
    <>
      {isActionSheetOpen && (
        <div className="fixed inset-0 z-40 mx-auto flex max-w-[430px] items-end bg-ink/35" role="presentation" onClick={() => setIsActionSheetOpen(false)}>
          <section
            aria-labelledby="create-action-title"
            aria-modal="true"
            className="w-full rounded-t-3xl bg-white p-5 pb-8 shadow-card"
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 id="create-action-title" className="text-lg font-semibold text-ink">What would you like to do?</h2>
              <button type="button" aria-label="Close action menu" onClick={() => setIsActionSheetOpen(false)} className="rounded-full p-2 text-ink-muted hover:bg-mint-50">
                <X size={20} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Link href="/sell" onClick={() => setIsActionSheetOpen(false)} className="rounded-2xl bg-mint-50 p-4 text-left transition hover:bg-mint-100">
                <span className="mb-3 flex size-10 items-center justify-center rounded-full bg-white text-primary"><Plus size={21} /></span>
                <span className="block font-semibold text-ink">Sell</span>
                <span className="mt-1 block text-xs text-ink-muted">List something lovely</span>
              </Link>
              <Link href="/donate" onClick={() => setIsActionSheetOpen(false)} className="rounded-2xl bg-mint-50 p-4 text-left transition hover:bg-mint-100">
                <span className="mb-3 flex size-10 items-center justify-center rounded-full bg-white text-primary"><Heart size={20} /></span>
                <span className="block font-semibold text-ink">Donate</span>
                <span className="mt-1 block text-xs text-ink-muted">Give clothes a new life</span>
              </Link>
            </div>
          </section>
        </div>
      )}
      <nav aria-label="Main navigation" className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[430px] rounded-t-2xl border-t border-border/70 bg-white/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 shadow-card backdrop-blur-lg">
        <ul className="grid grid-cols-5 items-end">
          <li>
            <NavLink label={destinations[0].label} href={destinations[0].href} active={pathname === destinations[0].href} Icon={destinations[0].Icon} />
          </li>
          <li>
            <NavLink label={destinations[1].label} href={destinations[1].href} active={pathname.startsWith("/swap")} Icon={destinations[1].Icon} />
          </li>
          <li className="flex justify-center">
            <button type="button" aria-label="Create listing or donation" onClick={() => setIsActionSheetOpen(true)} className="-mt-5 flex items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
              <span className="flex size-12 items-center justify-center rounded-full bg-mint-200 text-primary shadow-card transition hover:bg-mint-100">
                <Plus size={25} strokeWidth={2} />
              </span>
            </button>
          </li>
          <li>
            <NavLink label={destinations[2].label} href={destinations[2].href} active={pathname.startsWith("/news")} Icon={destinations[2].Icon} />
          </li>
          <li>
            <NavLink label={destinations[3].label} href={destinations[3].href} active={pathname.startsWith("/profile") || pathname.startsWith("/orders")} Icon={destinations[3].Icon} />
          </li>
        </ul>
      </nav>
    </>
  );
}

function NavLink({ label, href, active, Icon }: { label: string; href: string; active: boolean; Icon: typeof Home }) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={`flex flex-col items-center gap-0.5 py-1 text-[10px] transition ${active ? "font-bold text-primary" : "font-normal text-ink-muted hover:text-primary"}`}>
      <span className={`flex h-7 items-center justify-center rounded-full px-3 transition ${active ? "bg-mint-200/70" : ""}`}>
        <Icon size={22} strokeWidth={active ? 2.25 : 1.75} fill={active ? "currentColor" : "none"} aria-hidden="true" />
      </span>
      {label}
    </Link>
  );
}
