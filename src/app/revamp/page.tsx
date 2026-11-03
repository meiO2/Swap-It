import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Recycle } from "lucide-react";

export default function RevampPage() {
  return (
    <main className="space-y-5 px-4 pb-6 pt-5">
      <header className="flex items-center gap-3"><Link href="/" aria-label="Back home" className="rounded-full p-2 text-ink-muted hover:bg-mint-50"><ArrowLeft size={20} /></Link><div><p className="text-xs font-medium uppercase tracking-[0.12em] text-primary">Circular design</p><h1 className="text-xl font-semibold text-ink">Revamp!</h1></div></header>
      <section className="relative min-h-[220px] overflow-hidden rounded-3xl bg-mint-100">
        <Image src="https://images.unsplash.com/photo-1551232864-3f0890e580d9?auto=format&fit=crop&w=1100&q=85" alt="Creative upcycled clothing on display" fill sizes="(max-width: 430px) 100vw, 430px" className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink/70 via-ink/15 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-5 text-white"><p className="flex items-center gap-2 text-xs"><Recycle size={15} /> Rescued, reworked, re-loved</p><h2 className="mt-1 text-2xl font-bold">Waste less. Wear wonder.</h2></div>
      </section>
      <section className="rounded-2xl bg-white p-4 shadow-card">
        <h2 className="text-base font-semibold text-ink">What is Revamp!?</h2>
        <p className="mt-2 text-xs leading-relaxed text-ink-muted">If a seller&apos;s item remains unsold for 3 months, SwapIt offers to buy it from the seller for 80% of its listing price. The piece can then be upcycled into something new.</p>
        <div className="mt-4 rounded-xl bg-mint-50 p-3"><p className="text-xs font-semibold text-ink">Example: unsold for 3 months</p><p className="mt-1 text-xs text-ink-muted">Listing price: Rp150,000</p><p className="mt-1 text-sm font-semibold text-primary">SwapIt offer: Rp120,000 in GP (80%)</p><p className="mt-1 text-[10px] text-ink-muted">The seller chooses whether to accept the offer.</p></div>
      </section>
      <Link href="/revamp/shop" className="flex items-center justify-between rounded-2xl bg-primary p-4 text-white shadow-primary">
        <span><span className="block text-xs text-white/85">Shop one-of-a-kind goods</span><span className="mt-1 block text-base font-semibold">Discover Revamp! goods</span></span><ArrowRight size={20} />
      </Link>
    </main>
  );
}
