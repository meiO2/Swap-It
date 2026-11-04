"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiRequest } from "@/lib/api";

type AuthMode = "login" | "register" | "verify" | "forgot" | "reset";

const headings: Record<AuthMode, { title: string; description: string }> = {
  login: { title: "Welcome back", description: "Sign in to your SwapIt account." },
  register: { title: "Create an account", description: "Join the circular wardrobe." },
  verify: { title: "Verify your email", description: "Enter the six-digit code sent to your email." },
  forgot: { title: "Forgot password", description: "We will email a password reset code if your account is eligible." },
  reset: { title: "Reset password", description: "Enter the six-digit email code and choose a new password." },
};

export default function AuthForm({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const params = useSearchParams();
  const { refresh } = useAuth();
  const emailFromUrl = params.get("email") ?? "";
  const nextPath = params.get("next");
  const [name, setName] = useState("");
  const [email, setEmail] = useState(emailFromUrl);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [resendSeconds, setResendSeconds] = useState(mode === "verify" || mode === "reset" ? 60 : 0);

  useEffect(() => {
    if (!resendSeconds) return;
    const timer = window.setTimeout(() => setResendSeconds((seconds) => seconds - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendSeconds]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const formData = new FormData(event.currentTarget);
    const submittedEmail = String(formData.get("email") ?? email).trim().toLowerCase();
    try {
      if (mode === "register") {
        await apiRequest("/api/auth/register", { method: "POST", body: JSON.stringify({ name, email: submittedEmail, password }) });
        router.push(`/verify-otp?email=${encodeURIComponent(submittedEmail)}`);
        return;
      }
      if (mode === "login") {
        await apiRequest("/api/auth/login", { method: "POST", body: JSON.stringify({ email: submittedEmail, password }) });
        await refresh();
        router.replace(nextPath?.startsWith("/") ? nextPath : "/profile");
        return;
      }
      if (mode === "verify") {
        await apiRequest("/api/auth/verify-otp", { method: "POST", body: JSON.stringify({ email: submittedEmail, code }) });
        setMessage("Email verified. You can now sign in.");
        router.replace("/login?verified=1");
        return;
      }
      if (mode === "forgot") {
        await apiRequest("/api/auth/forgot-password", { method: "POST", body: JSON.stringify({ email: submittedEmail }) });
        setMessage("If an eligible account exists, a reset code has been sent.");
        router.push(`/reset-password?email=${encodeURIComponent(submittedEmail)}`);
        return;
      }
      await apiRequest("/api/auth/reset-password", { method: "POST", body: JSON.stringify({ email: submittedEmail, code, newPassword: password }) });
      router.replace("/login?reset=1");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function resendCode() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await apiRequest("/api/auth/resend-otp", {
        method: "POST",
        body: JSON.stringify({ email: email.trim().toLowerCase(), purpose: mode === "verify" ? "REGISTER" : "FORGOT_PASSWORD" }),
      });
      setMessage("A new code has been requested.");
      setResendSeconds(60);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not resend the code.");
    } finally {
      setBusy(false);
    }
  }

  const needsEmail = mode === "login" || mode === "register" || mode === "forgot";
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col justify-center bg-background px-5 py-10">
      <div className="rounded-3xl bg-white p-6 shadow-card">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">SwapIt</p>
        <h1 className="mt-2 text-2xl font-bold text-ink">{headings[mode].title}</h1>
        <p className="mt-1 text-sm text-ink-muted">{headings[mode].description}</p>
        <form className="mt-6 space-y-4" onSubmit={submit}>
          {mode === "register" && <label className="block text-xs font-medium text-ink">Name<input required name="name" autoComplete="name" maxLength={100} value={name} onChange={(event) => setName(event.target.value)} className="form-input mt-1" /></label>}
          {(needsEmail || mode === "verify" || mode === "reset") && (
            <label className="block text-xs font-medium text-ink">Email<input required name="email" type="email" autoComplete="email" readOnly={mode === "verify" || mode === "reset"} value={email} onChange={(event) => setEmail(event.target.value)} className="form-input mt-1 read-only:opacity-70" /></label>
          )}
          {(mode === "verify" || mode === "reset") && <label className="block text-xs font-medium text-ink">Six-digit code<input required name="code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} className="form-input mt-1 tracking-[0.3em]" /></label>}
          {(mode === "login" || mode === "register" || mode === "reset") && <label className="block text-xs font-medium text-ink">{mode === "reset" ? "New password" : "Password"}<input required name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} className="form-input mt-1" /></label>}
          {error && <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p>}
          {message && <p role="status" className="rounded-xl bg-success/10 p-3 text-sm text-success">{message}</p>}
          <button type="submit" disabled={busy} className="min-h-12 w-full rounded-full bg-primary px-4 text-sm font-semibold text-white disabled:opacity-60">{busy ? "Please wait…" : mode === "verify" ? "Verify email" : mode === "forgot" ? "Send reset code" : mode === "reset" ? "Reset password" : mode === "register" ? "Create account" : "Sign in"}</button>
        </form>
        {(mode === "verify" || mode === "reset") && <div className="mt-4 text-center text-xs text-ink-muted"><button type="button" disabled={busy || resendSeconds > 0} onClick={resendCode} className="font-semibold text-primary disabled:opacity-50">{resendSeconds ? `Resend code in ${resendSeconds}s` : "Resend code"}</button></div>}
        <nav className="mt-5 flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs font-medium text-primary">
          {mode !== "login" && <Link href="/login">Sign in</Link>}
          {mode !== "register" && <Link href="/register">Create account</Link>}
          {(mode === "login" || mode === "register") && <Link href="/forgot-password">Forgot password?</Link>}
        </nav>
      </div>
    </main>
  );
}
