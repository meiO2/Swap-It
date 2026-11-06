
import Link from "next/link";
import {
  Bell,
  MapPin,
  MessageCircle,
  QrCode,
  Search,
  ShoppingBag,
} from "lucide-react";

export default function TopBar() {
  return (
    <header className="px-4 pt-5">
      <div className="mb-4 flex items-center justify-between">
        <Link
          href="/"
          aria-label="SwapIt home"
          className="text-[22px] font-bold tracking-tight text-primary"
        >
          SwapIt<span className="text-primary-soft">.</span>
        </Link>

        <div className="flex items-center gap-1">
          <Link
            href="/donate"
            aria-label="Open your SwapIt QR code"
            className="rounded-full p-2 text-ink-muted transition hover:bg-mint-50 hover:text-primary"
          >
            <QrCode size={21} strokeWidth={1.75} />
          </Link>

          <Link
            href="/cart"
            aria-label="View shopping cart"
            className="rounded-full p-2 text-ink-muted transition hover:bg-mint-50 hover:text-primary"
          >
            <ShoppingBag size={21} strokeWidth={1.75} />
          </Link>

          <Link
            href="/notifications"
            aria-label="Notifications"
            className="relative rounded-full p-2 text-ink-muted transition hover:bg-mint-50 hover:text-primary"
          >
            <Bell size={21} strokeWidth={1.75} />
            <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-danger" />
          </Link>

          <Link
            href="/chat"
            aria-label="Chats"
            className="rounded-full p-2 text-ink-muted transition hover:bg-mint-50 hover:text-primary"
          >
            <MessageCircle size={21} strokeWidth={1.75} />
          </Link>
        </div>
      </div>

      <h1 className="mb-3 text-xl font-semibold text-ink">Home</h1>

      <label className="flex h-11 items-center gap-2 rounded-full border border-border bg-white px-3.5 text-ink-muted">
        <Search size={18} strokeWidth={1.75} aria-hidden="true" />

        <input
          type="search"
          placeholder="Search clothes, brands, or styles"
          aria-label="Search clothes, brands, or styles"
          className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted"
        />

        <Link
          href="/map"
          aria-label="Choose your location"
          className="flex items-center gap-1 border-l border-border pl-2 text-xs text-primary"
        >
          <MapPin size={15} strokeWidth={1.75} />
          BSD
        </Link>
      </label>
    </header>
  );
}
