"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Camera, CircleHelp } from "lucide-react";
import { FormEvent, useState } from "react";
import { useSwapStore } from "@/store/useSwapStore";

export default function SellPage() {
  const addListing = useSwapStore((state) => state.addListing);
  const router = useRouter();
  const [fulfillment, setFulfillment] = useState<"Swap Hub drop-off" | "Pickup">("Swap Hub drop-off");
  const [photoName, setPhotoName] = useState("");
  const [error, setError] = useState("");

  function submitListing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const title = String(formData.get("title") ?? "").trim();
    const price = Number(formData.get("price"));
    if (!title || !Number.isFinite(price) || price <= 0) return;
    try {
      addListing({
        title,
        category: String(formData.get("category") ?? ""),
        size: String(formData.get("size") ?? ""),
        condition: String(formData.get("condition") ?? ""),
        price,
        fulfillment,
        pickupDate: fulfillment === "Pickup" ? String(formData.get("pickupDate") ?? "") : undefined,
      });
      router.push("/listings");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The listing could not be submitted.");
    }
  }

  return (
    <main className="px-4 pb-6 pt-5">
      <header className="mb-5 flex items-center gap-3"><Link href="/" aria-label="Back home" className="rounded-full p-2 text-ink-muted hover:bg-mint-50"><ArrowLeft size={20} /></Link><div><h1 className="text-xl font-semibold text-ink">Sell a piece</h1><p className="text-xs text-ink-muted">Give something good another chapter</p></div></header>
      <form onSubmit={submitListing} className="space-y-4">
        <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-primary/40 bg-mint-50 text-center">
          <Camera className="text-primary" size={23} />
          <span className="mt-2 text-xs font-semibold text-ink">{photoName || "Add photos of your item"}</span>
          <span className="mt-1 text-[10px] text-ink-muted">Choose a clear, well-lit photo</span>
          <input type="file" accept="image/*" aria-label="Upload product photos" className="sr-only" onChange={(event) => setPhotoName(event.target.files?.[0]?.name ?? "")} />
        </label>
        <Field label="Listing title"><input name="title" required maxLength={70} placeholder="e.g. Linen blend shirt" className="form-input" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category"><select name="category" required className="form-input"><option value="">Select</option>{["Tops", "Bottoms", "Dresses", "Outerwear", "Accessories", "Shoes"].map((item) => <option key={item}>{item}</option>)}</select></Field>
          <Field label="Size"><select name="size" required className="form-input"><option value="">Select</option>{["XS", "S", "M", "L", "XL", "One size"].map((item) => <option key={item}>{item}</option>)}</select></Field>
        </div>
        <Field label="Condition"><select name="condition" required className="form-input"><option value="">Select condition</option>{["Like new", "Very good", "Good"].map((item) => <option key={item}>{item}</option>)}</select></Field>
        <Field label="Listing price (Rp)"><input name="price" type="number" min="1" step="1000" required placeholder="125000" className="form-input" /></Field>
        <fieldset>
          <legend className="mb-2 text-xs font-semibold text-ink">How will you hand it over?</legend>
          <div className="grid grid-cols-2 gap-2">
            {(["Swap Hub drop-off", "Pickup"] as const).map((option) => (
              <button key={option} type="button" aria-pressed={fulfillment === option} onClick={() => setFulfillment(option)} className={`rounded-xl border p-3 text-left text-xs ${fulfillment === option ? "border-primary bg-mint-50 text-primary" : "border-border bg-white text-ink-muted"}`}>
                <span className="block font-semibold">{option}</span>
                {/* TODO: Apply the pickup fee once SwapIt's pickup pricing is defined. */}
                <span className="mt-1 block text-[10px]">{option === "Pickup" ? "Pickup service · extra fee applies" : "Show your unique QR at a hub"}</span>
              </button>
            ))}
          </div>
        </fieldset>
        {fulfillment === "Pickup" && (
          <Field label="Pickup date"><input name="pickupDate" type="date" required className="form-input" /></Field>
        )}
        <div className="flex gap-2 rounded-xl bg-mint-50 p-3 text-[10px] leading-relaxed text-ink-muted"><CircleHelp size={15} className="mt-0.5 shrink-0 text-primary" />A SwapIt team member checks every piece at the end of the day. Your seller status updates after QC.</div>
        {error && <p role="alert" className="text-xs text-danger">{error}</p>}
        <button type="submit" className="h-12 w-full rounded-full bg-primary text-sm font-semibold text-white shadow-primary hover:bg-primary-dark">Submit listing</button>
      </form>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-xs font-semibold text-ink">{label}<span className="mt-1.5 block">{children}</span></label>;
}
