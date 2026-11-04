    "use client";

    import { Suspense, useState, type FormEvent } from "react";
    import { useRouter, useSearchParams } from "next/navigation";
    import { ShieldCheck } from "lucide-react";
    import { apiRequest } from "@/lib/api";
    import { useAuth } from "@/components/auth/AuthProvider";

    // TODO: change these if your customer login uses different endpoints.
    const LOGIN_ENDPOINT = "/api/auth/login";
    const LOGOUT_ENDPOINT = "/api/auth/logout";
    const ALLOWED_ROLES = ["ADMIN", "INSPECTOR"];

    type LoginResponse = { role?: string; user?: { role?: string } };

    function safeNext(value: string | null) {
    // Only allow redirects back into /admin (blocks open redirects).
    return value && value.startsWith("/admin") && !value.startsWith("//") && !value.startsWith("/admin/login") ? value : "/admin";
    }

    function AdminLoginForm() {
    const router = useRouter();
    const params = useSearchParams();
    const { refresh } = useAuth();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    async function signIn(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setSubmitting(true);
        setError("");
        try {
        const result = await apiRequest<LoginResponse>(LOGIN_ENDPOINT, { method: "POST", body: JSON.stringify({ email, password }) });
        const role = result?.user?.role ?? result?.role;
        if (role && !ALLOWED_ROLES.includes(role)) {
            await apiRequest(LOGOUT_ENDPOINT, { method: "POST" }).catch(() => undefined);
            setError("This account does not have admin access. Customers can sign in from the main login page.");
            return;
        }
        await refresh();
        router.replace(safeNext(params.get("next")));
        router.refresh();
        } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not sign in. Check your email and password.");
        } finally {
        setSubmitting(false);
        }
    }

    return (
        <div className="mx-auto w-full max-w-md space-y-5">
        <header className="text-center">
            <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-mint-50 text-primary"><ShieldCheck size={20} /></span>
            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-primary">SwapIt operations</p>
            <h1 className="mt-1 text-2xl font-bold text-ink">Admin login</h1>
            <p className="mt-2 text-sm text-ink-muted">Sign in with your admin or inspector account to manage QC, Revamp! and news.</p>
        </header>
        {error && <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p>}
        <form onSubmit={signIn} className="grid gap-3 rounded-2xl bg-white p-5 shadow-card">
            <label className="block text-xs font-medium text-ink">Email<input required type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} className="form-input mt-1" /></label>
            <label className="block text-xs font-medium text-ink">Password<input required type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="form-input mt-1" /></label>
            <button type="submit" disabled={submitting} className="mt-2 min-h-11 w-full rounded-full bg-primary text-sm font-semibold text-white disabled:opacity-60">{submitting ? "Signing in…" : "Sign in"}</button>
        </form>
        <p className="text-center text-xs text-ink-muted">Not an admin? Use the customer login instead.</p>
        </div>
    );
    }

    export default function AdminLoginPage() {
    return (
        <main className="flex min-h-dvh items-center bg-mint-50/40 px-4 py-10">
        <Suspense fallback={<p role="status" className="mx-auto rounded-xl bg-white p-4 text-sm text-ink-muted">Loading…</p>}>
            <AdminLoginForm />
        </Suspense>
        </main>
    );
    }