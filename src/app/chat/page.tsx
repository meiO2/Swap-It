import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Search } from "lucide-react";
import { chats } from "@/data/mock";

export default function ChatListPage() {
  return (
    <main className="px-4 pb-6 pt-5">
      <header className="mb-5 flex items-center gap-3">
        <Link href="/" aria-label="Back home" className="rounded-full p-2 text-ink-muted hover:bg-mint-50"><ArrowLeft size={20} /></Link>
        <div>
          <h1 className="text-xl font-semibold text-ink">Messages</h1>
          <p className="text-xs text-ink-muted">Say hello to the SwapIt community</p>
        </div>
      </header>
      <label className="mb-4 flex h-11 items-center gap-2 rounded-full border border-border bg-white px-3.5 text-ink-muted">
        <Search size={17} />
        <input aria-label="Search conversations" placeholder="Search conversations" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-muted" />
      </label>
      <div className="space-y-1">
        {chats.map((chat) => (
          <Link key={chat.id} href={`/chat/${chat.id}`} className="flex items-center gap-3 rounded-2xl p-3 transition hover:bg-mint-50">
            <div className="relative size-12 shrink-0 overflow-hidden rounded-full bg-mint-50">
              <Image src={chat.avatar} alt="" fill sizes="48px" className="object-cover" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <h2 className="truncate text-sm font-semibold text-ink">{chat.name}</h2>
                <span className="shrink-0 text-[10px] text-ink-muted">{chat.time}</span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-2">
                <p className="truncate text-xs text-ink-muted">{chat.lastMessage}</p>
                {chat.unread > 0 && <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-white">{chat.unread}</span>}
              </div>
            </div>
          </Link>
        ))}
      </div>
      <div className="mt-5 rounded-2xl bg-mint-50 p-4">
        <h2 className="text-sm font-semibold text-ink">A little kindness goes a long way</h2>
        <p className="mt-1 text-xs leading-relaxed text-ink-muted">Keep conversations friendly and arrange swaps in a safe public place.</p>
      </div>
    </main>
  );
}
