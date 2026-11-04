import { Suspense } from "react";
import AuthForm from "@/components/auth/AuthForm";

export default function ResetPasswordPage() {
  return <Suspense fallback={<main className="min-h-dvh" />}><AuthForm mode="reset" /></Suspense>;
}
