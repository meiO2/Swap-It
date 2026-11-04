import Link from "next/link";

export default function ForbiddenPage() {
  return (
    <main className="mx-auto max-w-xl px-6 py-16 text-center">
      <h1 className="text-2xl font-bold text-ink">Access denied</h1>
      <p className="mt-2 text-sm text-ink-muted">Your account does not have permission to view this page.</p>
      <Link href="/" className="mt-5 inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-white">Go home</Link>
    </main>
  );
}
