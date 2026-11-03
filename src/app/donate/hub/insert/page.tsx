"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Leaf, Minus, Plus } from "lucide-react";
import { motion } from "framer-motion";
import { HubStepGuard, StickyActions, hubPrimaryButton } from "@/components/hub/hub-ui";
import { DONATION_HUB_BOX_IMAGE } from "@/lib/assets";
import { GP_PER_ITEM, MAX_DONATION_ITEMS } from "@/lib/hub";
import { useHubSession } from "@/store/hubSession";
import { formatGP } from "@/lib/format";

function InsertContent() {
  const router = useRouter();
  const itemCount = useHubSession((state) => state.itemCount);
  const setItemCount = useHubSession((state) => state.setItemCount);
  const [quantity, setQuantity] = useState(String(itemCount));
  const parsedQuantity = quantity === "" ? 0 : Number(quantity);
  const invalid = !Number.isInteger(parsedQuantity) || parsedQuantity < 1 || parsedQuantity > MAX_DONATION_ITEMS;

  function updateQuantity(value: string) {
    setQuantity(value);
    if (value === "") {
      setItemCount(0);
      return;
    }
    const parsed = Number(value);
    if (Number.isFinite(parsed)) setItemCount(parsed);
  }

  return (
    <HubStepGuard step="insert">
      <main className="flex flex-1 flex-col pt-5">
        <section className="relative overflow-hidden rounded-3xl bg-hub-mint px-5 pb-4 pt-3 text-center">
          <div className="relative mx-auto h-[142px] w-full max-w-[230px] overflow-hidden">
            <Image src={DONATION_HUB_BOX_IMAGE} alt="Open green Swap Hub donation box with a leaf symbol" fill sizes="230px" className="object-contain" />
            <motion.span aria-hidden="true" className="absolute left-[13%] top-[39%] h-3 w-1 -rotate-45 rounded-full bg-hub-primary" animate={{ opacity: [0.35, 1, 0.35], y: [0, -3, 0] }} transition={{ duration: 2, repeat: Infinity }} />
            <motion.span aria-hidden="true" className="absolute right-[17%] top-[26%] h-3 w-1 rotate-45 rounded-full bg-hub-primary" animate={{ opacity: [0.4, 1, 0.4], y: [0, -3, 0] }} transition={{ duration: 1.7, repeat: Infinity, delay: 0.3 }} />
            <motion.span aria-hidden="true" className="absolute right-[12%] top-[52%] h-2.5 w-1 -rotate-12 rounded-full bg-hub-primary" animate={{ opacity: [0.3, 0.9, 0.3], x: [0, 2, 0] }} transition={{ duration: 2.2, repeat: Infinity, delay: 0.6 }} />
          </div>
          <span className="mx-auto flex min-h-9 w-fit items-center gap-2 rounded-full bg-hub-mint-strong px-4 text-xs font-semibold text-hub-primary"><Check size={15} /> Hub lid is open</span>
          <p className="mx-auto mt-3 max-w-xs text-xs leading-relaxed text-hub-muted">Put your clothes into the Hub one by one, then enter how many pieces you inserted.</p>
        </section>

        <section className="mt-4 rounded-3xl bg-white p-4 shadow-card">
          <div className="flex items-center justify-center gap-5">
            <button type="button" aria-label="Remove one item" disabled={itemCount <= 0} onClick={() => updateQuantity(String(Math.max(0, itemCount - 1)))} className="flex size-11 items-center justify-center rounded-full bg-hub-mint-strong text-hub-primary disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hub-primary"><Minus size={19} /></button>
            <output className={`w-24 text-center text-3xl font-bold ${invalid ? "text-danger" : "text-hub-ink"}`} aria-live="polite">{quantity || "0"}</output>
            <button type="button" aria-label="Add one item" disabled={itemCount >= MAX_DONATION_ITEMS} onClick={() => updateQuantity(String(Math.min(MAX_DONATION_ITEMS, itemCount + 1)))} className="flex size-11 items-center justify-center rounded-full bg-hub-primary text-white disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hub-primary"><Plus size={19} /></button>
          </div>
          <input
            aria-label="Number of donated clothing items"
            type="number"
            min={0}
            max={MAX_DONATION_ITEMS}
            step={1}
            value={quantity}
            onChange={(event) => updateQuantity(event.target.value)}
            aria-invalid={invalid}
            aria-describedby={invalid ? "quantity-error" : "quantity-hint"}
            className={`mt-3 h-11 w-full rounded-xl border bg-white px-3 text-sm text-hub-ink outline-none focus:ring-2 focus:ring-hub-primary ${invalid ? "border-danger" : "border-hub-line"}`}
          />
          {invalid ? (
            <p id="quantity-error" aria-live="polite" role="alert" className="mt-2 text-xs font-medium text-danger">{parsedQuantity < 1 ? "Minimum quantity is 1" : `Maximum quantity is ${MAX_DONATION_ITEMS}`}</p>
          ) : (
            <p id="quantity-hint" className="mt-1 text-[10px] text-hub-muted">Valid range: 1 – {MAX_DONATION_ITEMS}</p>
          )}
        </section>

        <section className="mt-4 flex items-center gap-3 rounded-2xl bg-hub-mint p-4">
          <Leaf size={23} className="shrink-0 text-hub-primary" fill="currentColor" />
          <div className="min-w-0 flex-1"><p className="text-[10px] font-medium text-hub-muted">You&apos;ll receive</p><p className="text-xl font-bold text-hub-primary">{formatGP(Math.max(0, itemCount) * GP_PER_ITEM)}</p><p className="text-[10px] text-hub-muted">({Math.max(0, itemCount)} × {GP_PER_ITEM} GP)</p></div>
        </section>

        <StickyActions>
          <button type="button" disabled={invalid} onClick={() => router.push("/donate/hub/confirm")} className={hubPrimaryButton}>Continue</button>
        </StickyActions>
      </main>
    </HubStepGuard>
  );
}

export default function DonationInsertPage() {
  return <InsertContent />;
}
