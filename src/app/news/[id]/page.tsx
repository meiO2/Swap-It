"use client";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Shirt } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";
import { formatShortDate } from "@/lib/format";
type NewsItem = { _id: string; title: string; date: string; description: string; clothesDistributed: number; image: string };
export default function NewsDetailPage() {
  const { id } = useParams<{ id: string }>(); const [item, setItem] = useState<NewsItem | null>(null); const [error, setError] = useState("");
  useEffect(() => { apiRequest<NewsItem>(`/api/news/${id}`).then(setItem).catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not load this article.")); }, [id]);
  if (!item && !error) return <main className="px-4 py-8 text-sm text-ink-muted">Loading article…</main>;
  if (!item) return <main className="px-4 py-8"><h1 className="text-lg font-semibold text-ink">{error}</h1><Link href="/news" className="mt-4 inline-block text-sm font-semibold text-primary">Back to Swap News</Link></main>;
  return <main className="pb-6"><div className="relative aspect-[16/10] bg-mint-50"><Image src={item.image} alt={item.title} fill priority sizes="(max-width: 430px) 100vw, 430px" className="object-cover" /><Link href="/news" aria-label="Back to news" className="absolute left-4 top-4 flex size-10 items-center justify-center rounded-full bg-white/90 text-ink"><ArrowLeft size={19} /></Link></div><article className="px-4 pt-5"><p className="text-xs font-semibold text-primary">{formatShortDate(item.date)}</p><h1 className="mt-2 text-2xl font-semibold leading-snug text-ink">{item.title}</h1><p className="mt-5 whitespace-pre-line text-sm leading-7 text-ink-muted">{item.description}</p><p className="mt-6 flex items-center gap-2 rounded-2xl bg-mint-50 p-4 text-sm font-semibold text-primary"><Shirt size={18} /> {item.clothesDistributed} clothes distributed</p></article></main>;
}
