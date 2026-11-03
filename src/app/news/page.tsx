import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Shirt } from "lucide-react";
import { swapNews } from "@/data/mock";
import { formatShortDate } from "@/lib/format";

export default function SwapNewsPage() {
  return (
    <main className="px-4 pb-6 pt-5">
      <header className="mb-5 flex items-center gap-3"><Link href="/" aria-label="Back home" className="rounded-full p-2 text-ink-muted hover:bg-mint-50"><ArrowLeft size={20} /></Link><div><h1 className="text-xl font-semibold text-ink">Swap News</h1><p className="text-xs text-ink-muted">Where donated clothes find their next home</p></div></header>
      <div className="space-y-4">
        {swapNews.map((item) => (
          <article key={item.id} className="overflow-hidden rounded-2xl bg-white shadow-card">
            <div className="relative aspect-[16/9] bg-mint-50"><Image src={item.image} alt={item.title} fill sizes="(max-width: 430px) 100vw, 430px" className="object-cover" /></div>
            <div className="p-4"><p className="text-[10px] font-medium text-primary">{formatShortDate(item.date)}</p><h2 className="mt-1 text-base font-semibold text-ink">{item.title}</h2><p className="mt-2 text-xs leading-relaxed text-ink-muted">{item.description}</p><p className="mt-3 flex items-center gap-2 rounded-xl bg-mint-50 p-3 text-xs font-semibold text-primary"><Shirt size={15} /> {item.clothesDistributed} clothes distributed</p></div>
          </article>
        ))}
      </div>
    </main>
  );
}
