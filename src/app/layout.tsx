import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import { Suspense } from "react";
import type { ReactNode } from "react";
import AppShell from "@/components/layout/AppShell";
import { AuthProvider } from "@/components/auth/AuthProvider";
import "leaflet/dist/leaflet.css";
import "./globals.css";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "SwapIt — Swap More, Waste Less",
  description: "Find preloved fashion, swap what you love, and keep clothes in circulation.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={poppins.variable}>
      <body className="min-h-dvh">
        <Suspense fallback={<div className="mx-auto min-h-dvh w-full max-w-[430px] bg-background" aria-busy="true" />}>
          <AuthProvider><AppShell>{children}</AppShell></AuthProvider>
        </Suspense>
      </body>
    </html>
  );
}
