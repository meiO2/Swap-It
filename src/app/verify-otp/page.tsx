import { Suspense } from "react";
import AuthForm from "@/components/auth/AuthForm";

export default function VerifyOtpPage() {
  return <Suspense fallback={<main className="min-h-dvh" />}><AuthForm mode="verify" /></Suspense>;
}
