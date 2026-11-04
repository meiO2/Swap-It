import Link from "next/link";
import { Newspaper, PackageCheck, ShieldCheck } from "lucide-react";

const cards = [
  { href: "/admin/qc", title: "Quality Control", detail: "Review submitted orders and listings.", Icon: ShieldCheck },
  { href: "/admin/revamp", title: "Revamp! merchandise", detail: "Register and manage upcycled items.", Icon: PackageCheck },
  { href: "/admin/news", title: "News", detail: "Create, save, and publish Swap News.", Icon: Newspaper },
];

export default function AdminDashboardPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6"><p className="text-xs font-semibold uppercase tracking-wide text-primary">SwapIt operations</p><h1 className="mt-1 text-2xl font-bold text-ink">Admin dashboard</h1><p className="mt-2 text-sm text-ink-muted">Choose an area to manage. QC reviews remain unavailable until the approved category criteria are configured.</p></header>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map(({ href, title, detail, Icon }) => <Link key={href} href={href} className="rounded-2xl bg-white p-5 shadow-card transition hover:-translate-y-0.5 hover:shadow-primary"><span className="flex size-11 items-center justify-center rounded-full bg-mint-50 text-primary"><Icon size={20} /></span><h2 className="mt-4 text-base font-semibold text-ink">{title}</h2><p className="mt-1 text-sm text-ink-muted">{detail}</p><span className="mt-4 inline-block text-xs font-semibold text-primary">Open section →</span></Link>)}
      </section>
    </div>
  );
}
