import Link from "next/link";
import { ArrowRight, Check, Heart, Plus, Star, X } from "lucide-react";

const colors = [
  { name: "Background", utility: "bg-background", text: "--color-background" },
  { name: "Surface", utility: "bg-surface", text: "--color-surface" },
  { name: "Primary", utility: "bg-primary", text: "--color-primary" },
  { name: "Primary dark", utility: "bg-primary-dark", text: "--color-primary-dark" },
  { name: "Primary soft", utility: "bg-primary-soft", text: "--color-primary-soft" },
  { name: "Mint 50", utility: "bg-mint-50", text: "--color-mint-50" },
  { name: "Mint 100", utility: "bg-mint-100", text: "--color-mint-100" },
  { name: "Mint 200", utility: "bg-mint-200", text: "--color-mint-200" },
  { name: "Ink", utility: "bg-ink", text: "--color-ink" },
  { name: "Muted", utility: "bg-ink-muted", text: "--color-ink-muted" },
  { name: "Border", utility: "bg-border", text: "--color-border" },
  { name: "Overlay", utility: "bg-overlay", text: "--color-overlay" },
  { name: "Warm accent", utility: "bg-accent-warm", text: "--color-accent-warm" },
  { name: "Danger", utility: "bg-danger", text: "--color-danger" },
  { name: "Warning", utility: "bg-warning", text: "--color-warning" },
  { name: "Success", utility: "bg-success", text: "--color-success" },
  { name: "Info", utility: "bg-info", text: "--color-info" },
];

export default function DesignSystemPage() {
  return (
    <main className="space-y-7 px-4 pb-8 pt-6">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-primary">SwapIt foundation</p>
          <h1 className="mt-1 text-2xl font-bold text-ink">Design system</h1>
        </div>
        <Link href="/" aria-label="Back to home" className="flex size-10 items-center justify-center rounded-full border border-border text-ink-muted hover:bg-mint-50">
          <ArrowRight className="rotate-180" size={18} />
        </Link>
      </header>

      <section>
        <SectionHeading title="Color palette" detail="Brand, surface, neutral, and semantic tokens" />
        <div className="mt-3 grid grid-cols-2 gap-2">
          {colors.map((color) => (
            <div key={color.name} className="flex items-center gap-2.5 rounded-xl border border-border bg-white p-2.5">
              <span className={`size-9 shrink-0 rounded-lg border border-ink/5 ${color.utility}`} />
              <span className="min-w-0">
                <span className="block text-xs font-semibold text-ink">{color.name}</span>
                <span className="block text-[10px] text-ink-muted">{color.text}</span>
              </span>
            </div>
          ))}
        </div>
        <div className="mt-3 h-12 rounded-2xl bg-gradient-fade" aria-label="White to mint gradient token" />
      </section>

      <section>
        <SectionHeading title="Typography" detail="Poppins, consistent and friendly" />
        <div className="mt-3 space-y-3 rounded-2xl border border-border bg-white p-4">
          <p className="text-2xl font-bold text-ink">Heading 1 · 24 / 700</p>
          <p className="text-lg font-semibold text-ink">Heading 2 · 18 / 600</p>
          <p className="text-sm text-ink">Body · 14 / 400 — Swap more, waste less.</p>
          <p className="text-xs text-ink-muted">Caption · 12 / 400 — A softer footprint, one piece at a time.</p>
        </div>
      </section>

      <section>
        <SectionHeading title="Buttons" detail="Primary and secondary actions" />
        <div className="mt-3 space-y-3 rounded-2xl border border-border bg-white p-4">
          <button type="button" className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold text-white shadow-primary transition hover:bg-primary-dark">
            <Heart size={17} /> Primary action
          </button>
          <button type="button" className="h-11 w-full rounded-full border border-border bg-white text-sm font-semibold text-ink transition hover:bg-mint-50">Secondary action</button>
          <div className="flex gap-2">
            <button type="button" aria-label="Accept" className="flex size-11 items-center justify-center rounded-full bg-success/15 text-success"><Check size={19} /></button>
            <button type="button" aria-label="Reject" className="flex size-11 items-center justify-center rounded-full bg-danger/15 text-danger"><X size={19} /></button>
            <button type="button" aria-label="Add" className="flex size-11 items-center justify-center rounded-full bg-mint-200 text-primary"><Plus size={19} /></button>
          </div>
        </div>
      </section>

      <section>
        <SectionHeading title="Inputs & shadows" detail="Rounded form fields and low-contrast elevation" />
        <div className="mt-3 space-y-3 rounded-2xl border border-border bg-white p-4">
          <input aria-label="Search input example" placeholder="Search · rounded-full" className="h-11 w-full rounded-full border border-border bg-white px-4 text-xs text-ink outline-none placeholder:text-ink-muted focus:border-primary" />
          <input aria-label="Form input example" placeholder="Form field · rounded-xl" className="form-input" />
          <div className="flex gap-3">
            <div className="flex-1 rounded-2xl bg-white p-3 text-center text-[10px] text-ink shadow-card">Card shadow</div>
            <div className="flex-1 rounded-full bg-primary p-3 text-center text-[10px] text-white shadow-primary">Primary shadow</div>
          </div>
        </div>
      </section>

      <section>
        <SectionHeading title="Badges" detail="Verification, sizes, and semantic statuses" />
        <div className="mt-3 flex flex-wrap gap-2 rounded-2xl border border-border bg-white p-4">
          <span className="rounded-full bg-primary px-3 py-1 text-[11px] font-semibold text-white">Verified</span>
          <span className="rounded-full bg-mint-50 px-3 py-1 text-[11px] font-semibold text-ink">M</span>
          <span className="rounded-full bg-success/15 px-3 py-1 text-[11px] font-semibold text-success">Completed</span>
          <span className="rounded-full bg-warning/15 px-3 py-1 text-[11px] font-semibold text-warning">Expiring soon</span>
          <span className="rounded-full bg-danger/15 px-3 py-1 text-[11px] font-semibold text-danger">Not eligible</span>
          <span className="rounded-full bg-info/15 px-3 py-1 text-[11px] font-semibold text-info">Update</span>
        </div>
      </section>

      <section>
        <SectionHeading title="Cards" detail="Soft shadow, rounded corners, and image overlays" />
        <div className="mt-3 grid grid-cols-2 gap-3">
          <article className="overflow-hidden rounded-2xl bg-white shadow-card">
            <div className="relative flex aspect-[4/3] items-end overflow-hidden bg-mint-100 p-3 text-white">
              <div className="absolute inset-0 bg-gradient-to-t from-ink/70 via-ink/10 to-transparent" />
              <div className="relative">
                <span className="flex items-center gap-1 text-[10px]"><Star size={12} className="fill-accent-warm text-accent-warm" /> 4.9 · Verified</span>
                <h3 className="mt-1 text-sm font-semibold">Card with overlay</h3>
              </div>
            </div>
            <div className="p-3">
              <p className="text-xs font-semibold text-ink">Everyday essential</p>
              <p className="mt-1 text-xs text-primary">125,000 GP</p>
            </div>
          </article>
          <article className="rounded-3xl bg-mint-100 p-4 shadow-card">
            <p className="text-xs font-medium text-primary">SwapIt community</p>
            <h3 className="mt-2 text-lg font-semibold leading-snug text-ink">Got Clothes to Spare?</h3>
            <p className="mt-2 text-xs text-ink-muted">Trade them, repair them, or donate them.</p>
            <button type="button" className="mt-4 flex items-center gap-1.5 rounded-full bg-white px-3 py-2 text-xs font-semibold text-primary">Explore <ArrowRight size={14} /></button>
          </article>
        </div>
      </section>

      <section>
        <SectionHeading title="Layout tokens" detail="Mobile-first spacing and radii" />
        <div className="mt-3 grid grid-cols-3 gap-2">
          <TokenTile title="Page padding" value="16 px" style="px-4" />
          <TokenTile title="Section gap" value="24 px" style="gap-6" />
          <TokenTile title="Card radius" value="16 px" style="rounded-2xl" />
        </div>
      </section>
    </main>
  );
}

function SectionHeading({ title, detail }: { title: string; detail: string }) {
  return (
    <div>
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      <p className="mt-0.5 text-xs text-ink-muted">{detail}</p>
    </div>
  );
}

function TokenTile({ title, value, style }: { title: string; value: string; style: string }) {
  return (
    <div className="rounded-xl border border-border bg-white p-2.5">
      <div className={`mb-2 flex h-9 items-center justify-center bg-mint-50 text-[10px] text-primary ${style}`}>{value}</div>
      <p className="text-[10px] font-medium text-ink">{title}</p>
    </div>
  );
}
