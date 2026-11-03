"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Send, ShieldCheck } from "lucide-react";
import { FormEvent, useState } from "react";
import { catalogProducts, chats } from "@/data/mock";
import StatusBadge from "@/components/ui/StatusBadge";
import { useSwapStore, type ChatMessage } from "@/store/useSwapStore";

export default function ChatThread({ id, productId }: { id: string; productId?: string }) {
  const person = chats.find((chat) => chat.id === id) ?? chats[0];
  const pinnedProduct = catalogProducts.find((product) => product.id === productId);
  const savedMessages = useSwapStore((state) => state.messagesByChat[id]);
  const sendChatMessage = useSwapStore((state) => state.sendChatMessage);
  const swapStatus = useSwapStore((state) => state.swapStatuses[id]);
  const updateSwapStatus = useSwapStore((state) => state.updateSwapStatus);
  const messages: ChatMessage[] = savedMessages ?? [
    { id: 1, text: "Hi! I’m interested in this piece. Is it still available?", own: true, time: "10:32" },
    { id: 2, text: "Yes, it’s still available! Happy to share more details.", own: false, time: "10:42" },
  ];
  const [draft, setDraft] = useState("");

  function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    sendChatMessage(id, text);
    setDraft("");
  }

  return (
    <main className="flex min-h-[calc(100vh-7rem)] flex-col px-4 pt-4">
      <header className="flex items-center gap-3 border-b border-border pb-3">
        <Link href="/chat" aria-label="Back to messages" className="rounded-full p-2 text-ink-muted hover:bg-mint-50"><ArrowLeft size={20} /></Link>
        <div className="relative size-10 overflow-hidden rounded-full bg-mint-50">
          <Image src={person.avatar} alt="" fill sizes="40px" className="object-cover" />
        </div>
        <div>
          <h1 className="text-sm font-semibold text-ink">{person.name}</h1>
          <p className="flex items-center gap-1 text-[10px] text-primary"><ShieldCheck size={12} /> SwapIt member</p>
        </div>
      </header>

      {pinnedProduct && <Link href={`/products/${pinnedProduct.id}`} className="mt-3 flex items-center gap-3 rounded-2xl bg-mint-50 p-3">
        <div className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-white">
          <Image src={pinnedProduct.image} alt={pinnedProduct.imageAlt} fill sizes="56px" className="object-cover" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] text-ink-muted">Product shared</p>
          <p className="truncate text-xs font-semibold text-ink">{pinnedProduct.name}</p>
          <p className="mt-0.5 text-xs font-semibold text-primary">{pinnedProduct.gpPrice.toLocaleString("id-ID")} GP</p>
        </div>
        <span className="text-[10px] font-semibold text-primary">View</span>
      </Link>}

      <div className="flex-1 space-y-3 overflow-y-auto py-5" aria-live="polite">
        <div className="mx-auto w-fit rounded-full bg-mint-50 px-3 py-1.5 text-[10px] text-ink-muted">Today</div>
        {messages.map((message) => (
          <div key={message.id} className={`flex ${message.own ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 ${message.own ? "rounded-br-md bg-primary text-white" : "rounded-bl-md bg-mint-50 text-ink"}`}>
              <p className="text-sm leading-relaxed">{message.text}</p>
              <p className={`mt-1 text-right text-[9px] ${message.own ? "text-white/75" : "text-ink-muted"}`}>{message.time}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="sticky bottom-24 bg-white pb-3 pt-2">
        {!swapStatus ? (
          <button type="button" onClick={() => updateSwapStatus(id, "Proposed")} className="mb-2 h-9 w-full rounded-full border border-primary/30 text-xs font-semibold text-primary hover:bg-mint-50">Propose swap</button>
        ) : (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-xl bg-mint-50 p-2.5">
            <span className="flex items-center gap-2 text-[10px] font-medium text-ink">Swap status <StatusBadge status={swapStatus} /></span>
            {swapStatus === "Proposed" && <button type="button" onClick={() => updateSwapStatus(id, "Accepted")} className="text-[10px] font-semibold text-primary">Accept</button>}
            {swapStatus === "Accepted" && <button type="button" onClick={() => updateSwapStatus(id, "Completed")} className="text-[10px] font-semibold text-success">Mark complete</button>}
          </div>
        )}
        <form onSubmit={sendMessage} className="flex h-11 items-center gap-2 rounded-full border border-border bg-white pl-4 pr-1.5">
          <input value={draft} onChange={(event) => setDraft(event.target.value)} aria-label="Write a message" placeholder="Write a message..." className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-muted" />
          <button type="submit" aria-label="Send message" className="flex size-8 items-center justify-center rounded-full bg-primary text-white hover:bg-primary-dark"><Send size={15} /></button>
        </form>
      </div>
    </main>
  );
}
