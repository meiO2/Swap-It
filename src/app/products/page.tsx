import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import ProductCard from "@/components/ui/ProductCard";
import { catalogProducts } from "@/data/mock";

export default function MarketplacePage() {
  return (
    <main className="px-4 pb-6 pt-5">
      <header className="mb-5 flex items-center gap-3"><Link href="/" aria-label="Back home" className="rounded-full p-2 text-ink-muted hover:bg-mint-50"><ArrowLeft size={20} /></Link><div><h1 className="text-xl font-semibold text-ink">Marketplace</h1><p className="text-xs text-ink-muted">Preloved favorites, ready for a new home</p></div></header>
      <div className="grid grid-cols-2 gap-3">{catalogProducts.map((product, index) => <ProductCard key={product.id} product={product} priority={index < 2} />)}</div>
    </main>
  );
}
