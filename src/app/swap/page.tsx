"use client";

import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Heart, MapPin, RotateCcw, ShieldCheck, X } from "lucide-react";
import { useState } from "react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Product } from "@/data/mock";
import { mapApiProduct, type ApiProduct } from "@/lib/products";
import { formatPrice } from "@/lib/format";

export default function SwapPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [matched, setMatched] = useState(false);
  const [matchedProduct, setMatchedProduct] = useState<(typeof products)[number] | null>(null);
  const [direction, setDirection] = useState(0);
  const [pendingMatch, setPendingMatch] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [startingConversation, setStartingConversation] = useState(false);
  const [conversationError, setConversationError] = useState("");
  useEffect(() => {
    Promise.all([
      fetch("/api/products?limit=50"),
      fetch("/api/auth/me").catch(() => null),
    ])
      .then(async ([productsResponse, userResponse]) => {
        const result = await productsResponse.json() as {
          success: boolean;
          data?: ApiProduct[];
          message?: string;
        };
        if (!productsResponse.ok || !result.success) {
          throw new Error(result.message || "Failed to load products.");
        }

        let authenticatedUserId = "";
        if (userResponse?.ok) {
          const userResult = await userResponse.json() as {
            success: boolean;
            data?: { id?: string };
          };
          if (userResult.success && userResult.data?.id) {
            authenticatedUserId = userResult.data.id;
          }
        }

        setProducts(
          (result.data ?? [])
            .map(mapApiProduct)
            .filter((product) => product.sellerId !== authenticatedUserId),
        );
      })
      .catch((error) => console.error("Swap products error:", error))
      .finally(() => setLoading(false));
  }, []);

  if (loading || products.length === 0) {
    return (
      <main className="px-4 pb-6 pt-5">
        <Link href="/" className="text-sm font-semibold text-primary">Back home</Link>
        <p className="mt-8 rounded-2xl bg-mint-50 p-5 text-center text-sm text-ink-muted">{loading ? "Loading products..." : "No products are available for swapping yet."}</p>
      </main>
    );
  }

  const activeProduct = products[activeIndex % products.length];
  const nextProduct = products[(activeIndex + 1) % products.length];

  function decide(liked: boolean) {
    if (isExiting) return;
    setDirection(liked ? 1 : -1);
    setIsExiting(true);
    setPendingMatch(liked);
    if (liked) setMatchedProduct(activeProduct);
    window.requestAnimationFrame(() => setActiveIndex((index) => index + 1));
  }

  function finishExit() {
    setDirection(0);
    setIsExiting(false);
    if (pendingMatch) setMatched(true);
    setPendingMatch(false);
  }

  function undoSwipe() {
    if (isExiting || activeIndex === 0) return;
    setActiveIndex((index) => Math.max(0, index - 1));
  }

  const matchedItem = matchedProduct ?? activeProduct;

  async function messageSeller() {
    if (!matchedItem.sellerId || startingConversation) {
      setConversationError("This listing does not have a valid seller account.");
      return;
    }

    setStartingConversation(true);
    setConversationError("");
    try {
      const response = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ recipientId: matchedItem.sellerId }),
      });
      const result = await response.json() as {
        success: boolean;
        data?: { _id: string };
        message?: string;
      };
      if (!response.ok || !result.success || !result.data?._id) {
        throw new Error(result.message || "Could not start this conversation.");
      }

      router.push(
        `/chat/${result.data._id}?product=${encodeURIComponent(matchedItem.id)}`,
      );
    } catch (error) {
      setConversationError(
        error instanceof Error ? error.message : "Could not start this conversation.",
      );
      setStartingConversation(false);
    }
  }

  return (
    <main className="px-4 pb-6 pt-5">
      <header className="mb-5 flex items-center justify-between">
        <Link href="/" aria-label="Back home" className="rounded-full p-2 text-ink-muted hover:bg-mint-50"><ArrowLeft size={20} /></Link>
        <div className="text-center">
          <h1 className="text-lg font-semibold text-ink">Swap</h1>
          <p className="text-xs text-ink-muted">Find your match · Swipe into a better wardrobe</p>
        </div>
        <button type="button" aria-label="Undo last swipe" onClick={undoSwipe} className="rounded-full p-2 text-ink-muted hover:bg-mint-50"><RotateCcw size={19} /></button>
      </header>

      <section aria-label="Clothes to swap" className="relative mx-auto h-[min(66vh,570px)] max-h-[570px] min-h-[430px] max-w-[390px]">
        <div className="absolute inset-2 translate-y-2 overflow-hidden rounded-3xl bg-mint-100 shadow-card">
          <Image src={nextProduct.image} alt="" fill sizes="390px" className="scale-95 object-cover opacity-70" />
        </div>
        <AnimatePresence custom={direction} mode="wait" onExitComplete={finishExit}>
          <motion.article
            key={activeProduct.id}
            custom={direction}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.75}
            onDrag={(_, info) => {
              const nextDirection = info.offset.x > 12 ? 1 : info.offset.x < -12 ? -1 : 0;
              if (!isExiting && nextDirection !== direction) setDirection(nextDirection);
            }}
            onDragEnd={(_, info) => {
              if (info.offset.x > 100 || info.velocity.x > 500) decide(true);
              else if (info.offset.x < -100 || info.velocity.x < -500) decide(false);
              else setDirection(0);
            }}
            initial={{ opacity: 0, y: 14, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1, rotate: direction * 2 }}
            variants={{
              exit: (exitDirection: number) => ({
                opacity: 0,
                x: exitDirection * 480,
                rotate: exitDirection * 12,
                transition: { duration: 0.32, ease: "easeIn" as const },
              }),
            }}
            exit="exit"
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="absolute inset-0 cursor-grab overflow-hidden rounded-3xl bg-surface shadow-card active:cursor-grabbing"
          >
            <Image src={activeProduct.image} alt={activeProduct.imageAlt} fill priority sizes="(max-width: 430px) 90vw, 390px" className="object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-transparent to-ink/15" />
            <motion.span
              animate={{ opacity: direction > 0 ? 1 : 0, scale: direction > 0 ? 1 : 0.85 }}
              transition={{ duration: 0.18 }}
              className="pointer-events-none absolute right-5 top-20 z-10 rounded-lg border-4 border-success px-3 py-1 text-3xl font-bold tracking-widest text-success"
              style={{ rotate: 12 }}
              aria-hidden="true"
            >
              LIKE
            </motion.span>
            <motion.span
              animate={{ opacity: direction < 0 ? 1 : 0, scale: direction < 0 ? 1 : 0.85 }}
              transition={{ duration: 0.18 }}
              className="pointer-events-none absolute left-5 top-20 z-10 rounded-lg border-4 border-danger px-3 py-1 text-3xl font-bold tracking-widest text-danger"
              style={{ rotate: -12 }}
              aria-hidden="true"
            >
              NOPE
            </motion.span>
            <span className="absolute left-4 top-4 flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-[11px] font-semibold text-white">
              <ShieldCheck size={14} /> Verified
            </span>
            <span className="absolute right-4 top-4 rounded-full bg-mint-50 px-3 py-1.5 text-xs font-semibold text-ink">{activeProduct.size}</span>
            <div className="absolute inset-x-0 bottom-0 p-5 text-white">
              <p className="mb-1 flex items-center gap-1.5 text-xs text-white/85"><MapPin size={14} /> {activeProduct.distance}</p>
              <h2 className="text-2xl font-bold">{activeProduct.name}</h2>
              <p className="mt-1 text-sm text-white/85">{activeProduct.condition} · {activeProduct.category}</p>
              <p className="mt-2 text-sm font-semibold">{formatPrice(activeProduct.price)}</p>
            </div>
          </motion.article>
        </AnimatePresence>
      </section>

      <div className="mt-5 flex items-center justify-center gap-7">
        <button type="button" aria-label="Pass on this item" onClick={() => decide(false)} disabled={isExiting} className="flex size-14 items-center justify-center rounded-full bg-danger/10 text-danger shadow-card transition hover:scale-105 hover:bg-danger/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger disabled:pointer-events-none">
          <X size={25} strokeWidth={2} />
        </button>
        <button type="button" aria-label="Like this item" onClick={() => decide(true)} disabled={isExiting} className="flex size-[68px] items-center justify-center rounded-full bg-primary text-white shadow-primary transition hover:scale-105 hover:bg-primary-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:pointer-events-none">
          <Heart size={28} strokeWidth={1.75} />
        </button>
      </div>

      {matched && (
        <div className="fixed inset-0 z-50 mx-auto flex max-w-[430px] items-center justify-center bg-ink/45 p-5" role="presentation">
          <section aria-labelledby="match-title" aria-modal="true" role="dialog" className="w-full rounded-3xl bg-white p-6 text-center shadow-card">
            <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-mint-100 text-primary"><Heart size={30} fill="currentColor" /></span>
            <h2 id="match-title" className="mt-4 text-2xl font-bold text-ink">Interested in this item?</h2>
            <p className="mt-2 text-sm text-ink-muted">You liked this listing. Start a conversation with the seller to discuss a swap.</p>
            {conversationError && (
              <p role="alert" className="mt-3 text-xs text-danger">
                {conversationError}
              </p>
            )}
            <button
              type="button"
              onClick={() => void messageSeller()}
              disabled={startingConversation}
              className="mt-5 flex h-11 w-full items-center justify-center rounded-full bg-primary text-sm font-semibold text-white shadow-primary hover:bg-primary-dark disabled:opacity-60"
            >
              {startingConversation ? "Opening chat..." : "Message seller"}
            </button>
            <button type="button" onClick={() => setMatched(false)} className="mt-3 h-10 w-full rounded-full text-sm font-semibold text-ink-muted hover:bg-mint-50">Keep browsing</button>
          </section>
        </div>
      )}
    </main>
  );
}
