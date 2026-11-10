import Image from "next/image";
import Link from "next/link";
import type { Product } from "@/data/mock";
import FavoriteButton from "@/components/ui/FavoriteButton";

export default function ProductCard({ product, priority = false }: { product: Product; priority?: boolean }) {
  return (
    <article className="group relative min-w-0 overflow-hidden rounded-2xl bg-white shadow-card transition hover:-translate-y-0.5">
      <FavoriteButton id={product.id} className="absolute right-2.5 top-2.5 z-10 size-8" />
      <Link href={`/products/${product.id}`} className="block">
      <div className="relative aspect-[4/4.7] overflow-hidden bg-mint-50">
        <Image
          src={product.image}
          alt={product.imageAlt}
          fill
          priority={priority}
          sizes="(max-width: 430px) 46vw, 190px"
          className="object-cover transition duration-300 group-hover:scale-105"
        />
        <span className="absolute left-2.5 top-2.5 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-medium text-ink">{product.size}</span>
      </div>
      <div className="p-3">
        <p className="truncate text-[13px] font-medium text-ink">{product.name}</p>
        <p className="mt-1 text-xs text-ink-muted">{product.condition}</p>
        <div className="mt-2 flex items-center justify-between gap-1">
          <span className="text-sm font-semibold text-primary">{product.gpPrice.toLocaleString("id-ID")} GP</span>
          <span className="text-[10px] text-ink-muted">≈ Rp{product.price.toLocaleString("id-ID")}</span>
        </div>
      </div>
      </Link>
    </article>
  );
}
