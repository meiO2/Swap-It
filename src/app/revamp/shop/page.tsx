import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import ProductCard from "@/components/ui/ProductCard";
import { revampProducts } from "@/data/mock";

export default function RevampShopPage() {
  return (
    <main className="px-4 pb-6 pt-5">
      <header className="mb-5 flex items-center gap-3"><Link href="/revamp" aria-label="Back to Revamp" className="rounded-full p-2 text-ink-muted hover:bg-mint-50"><ArrowLeft size={20} /></Link><div><h1 className="text-xl font-semibold text-ink">Revamp! shop</h1><p className="text-xs text-ink-muted">Upcycled in small batches</p></div></header>
      <div className="mb-4 rounded-2xl bg-mint-50 p-3 text-xs leading-relaxed text-ink-muted">Each piece gives rescued textiles a new purpose. Checkout with money, Green Points, or a mix.</div>
      <div className="grid grid-cols-2 gap-3">{revampProducts.map((product) => <ProductCard key={product.id} product={product} />)}</div>
    </main>
  );
}
