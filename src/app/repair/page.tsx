import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight, MapPin, Star } from "lucide-react";
import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";
import type { RepairShop } from "@/data/mock";

export default function RepairPage() {
  const [repairShops, setRepairShops] = useState<RepairShop[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiRequest<RepairShop[]>("/api/repair-shops")
      .then(setRepairShops)
      .catch((error: unknown) => console.error("Repair shops error:", error))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="px-4 pb-6 pt-5">
      <header className="mb-4 flex items-center gap-3">
        <Link href="/" aria-label="Back home" className="rounded-full p-2 text-ink-muted hover:bg-mint-50"><ArrowLeft size={20} /></Link>
        <div>
          <h1 className="text-xl font-semibold text-ink">Repair & care</h1>
          <p className="text-xs text-ink-muted">Keep your favorites in rotation</p>
        </div>
      </header>

      <Link href="/map" className="group relative block min-h-[190px] overflow-hidden rounded-3xl bg-mint-100 shadow-card">
        <Image src="https://images.unsplash.com/photo-1452860606245-08befc0ff44b?auto=format&fit=crop&w=1100&q=85" alt="Tailor working carefully on a garment" fill sizes="(max-width: 430px) 100vw, 430px" className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-ink/65 via-ink/30 to-transparent" />
        <div className="relative flex min-h-[190px] max-w-[250px] flex-col justify-center p-5 text-white">
          <span className="text-xs font-medium text-white/85">Local makers, longer-lasting clothes</span>
          <h2 className="mt-1 text-2xl font-bold leading-tight">Find Repair Shop Near You</h2>
          <span className="mt-4 inline-flex w-fit items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-semibold text-primary">Explore map <ArrowRight size={14} /></span>
        </div>
      </Link>

      <section className="pt-6">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-primary">BSD City</p>
            <h2 className="mt-1 text-lg font-semibold text-ink">Near You</h2>
          </div>
          <Link href="/map" className="text-xs font-semibold text-primary">Map view</Link>
        </div>
        <div className="space-y-3">
          {loading ? <p className="rounded-2xl bg-mint-50 p-5 text-center text-sm text-ink-muted">Loading repair shops...</p> : repairShops.length > 0 ? repairShops.map((shop) => (
            <article key={shop.id} className="flex gap-3 rounded-2xl bg-white p-3 shadow-card">
              <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-mint-50">
                <Image src={shop.image} alt="" fill sizes="96px" className="object-cover" />
              </div>
              <div className="min-w-0 flex-1 py-1">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="truncate text-sm font-semibold text-ink">{shop.name}</h3>
                  <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-ink"><Star size={13} className="fill-accent-warm text-accent-warm" /> {shop.rating}</span>
                </div>
                <p className="mt-1 text-xs text-ink-muted">{shop.category}</p>
                <p className="mt-2 flex items-center gap-1 text-[10px] text-ink-muted"><MapPin size={12} /> {shop.distance} · {shop.address}</p>
                <button type="button" className="mt-2 text-xs font-semibold text-primary hover:text-primary-dark">View details</button>
              </div>
            </article>
          )) : <p className="rounded-2xl bg-mint-50 p-5 text-center text-sm text-ink-muted">No repair shops are available yet.</p>}
        </div>
      </section>
    </main>
  );
}
