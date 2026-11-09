  "use client";

  import Link from "next/link";
  import { useState, type ReactNode } from "react";
  import { usePathname, useRouter } from "next/navigation";
  import {
    Gift,
    LayoutDashboard,
    Menu,
    Newspaper,
    PackageCheck,
    ShieldCheck,
    X,
    RotateCcw,
    RadioTower,
  } from "lucide-react";
  import { useAuth, type AuthUser } from "@/components/auth/AuthProvider";

  const links = [
    { href: "/admin", label: "Overview", Icon: LayoutDashboard, adminOnly: false },
    { href: "/admin/qc", label: "Quality Control", Icon: ShieldCheck, adminOnly: false },
    { href: "/admin/refunds", label: "Refunds", Icon: RotateCcw, adminOnly: false },
    { href: "/admin/donations", label: "Donation GP", Icon: Gift, adminOnly: false },
    { href: "/admin/hubs", label: "Swap Hub", Icon: RadioTower, adminOnly: true },
    { href: "/admin/revamp", label: "Revamp! Merchandise", Icon: PackageCheck, adminOnly: true },
    { href: "/admin/news", label: "News", Icon: Newspaper, adminOnly: true },
  ];

  export default function AdminShell({ children, user }: { children: ReactNode; user: AuthUser }) {
    const pathname = usePathname();
    const router = useRouter();
    const { signOut } = useAuth();
    const [menuOpen, setMenuOpen] = useState(false);
    const [error, setError] = useState("");

    async function logout() {
      try {
        await signOut();
        router.replace("/admin/login");
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Could not sign out.");
      }
    }

    const nav = (
      <>
        <div className="flex items-center justify-between border-b border-border p-5">
          <div><p className="font-bold text-primary">SwapIt Admin</p><p className="mt-1 text-xs text-ink-muted">{user.name} · {user.role}</p></div>
          <button type="button" aria-label="Close admin menu" className="md:hidden" onClick={() => setMenuOpen(false)}><X size={20} /></button>
        </div>
        <nav aria-label="Admin navigation" className="space-y-1 p-3">
          {links.filter((item) => !item.adminOnly || user.role === "ADMIN").map(({ href, label, Icon }) => (
            <Link key={href} href={href} onClick={() => setMenuOpen(false)} aria-current={pathname === href ? "page" : undefined} className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium ${pathname === href ? "bg-mint-50 text-primary" : "text-ink-muted hover:bg-mint-50"}`}>
              <Icon size={18} />{label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto border-t border-border p-4">
          {error && <p role="alert" className="mb-2 text-xs text-danger">{error}</p>}
          <button type="button" onClick={() => void logout()} className="min-h-11 w-full rounded-full border border-danger/30 text-sm font-semibold text-danger hover:bg-danger/5">Sign Out</button>
        </div>
      </>
    );

    return (
      <div className="min-h-dvh bg-mint-50 md:flex">
        <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-white md:flex">{nav}</aside>
        <header className="flex items-center justify-between border-b border-border bg-white px-4 py-3 md:hidden">
          <p className="font-semibold text-primary">SwapIt Admin</p>
          <button type="button" aria-expanded={menuOpen} aria-label="Open admin menu" onClick={() => setMenuOpen(true)} className="flex size-11 items-center justify-center rounded-full hover:bg-mint-50"><Menu /></button>
        </header>
        {menuOpen && <div className="fixed inset-0 z-50 flex bg-ink/40 md:hidden" role="presentation" onClick={() => setMenuOpen(false)}><aside className="flex w-[min(20rem,85vw)] flex-col bg-white shadow-card" role="dialog" aria-modal="true" aria-label="Admin menu" onClick={(event) => event.stopPropagation()}>{nav}</aside></div>}
        <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
      </div>
    );
  }
