"use client";

import { Suspense, useSyncExternalStore, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import BottomNav from "@/components/layout/BottomNav";
import StoreHydration from "@/components/StoreHydration";

const subscribeToNothing = () => () => {};

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isAdminRoute = useSyncExternalStore(
    subscribeToNothing,
    () => pathname === "/admin" || pathname.startsWith("/admin/"),
    () => false,
  );
  const isDonationRoute = pathname === "/donate" || pathname.startsWith("/donate/");
  const isCheckoutRoute = pathname === "/checkout";
  const usesAppWidth = !isAdminRoute;

  return (
    <div className={`mx-auto flex min-h-dvh w-full flex-col bg-background ${usesAppWidth ? "max-w-[430px] shadow-card" : ""}`}>
      <StoreHydration />
      <div className={`flex-1 ${usesAppWidth && !isDonationRoute && !isCheckoutRoute ? "pb-[calc(6rem+env(safe-area-inset-bottom))]" : ""}`}>{children}</div>
      {!isAdminRoute && !isDonationRoute && !isCheckoutRoute && (
        <Suspense fallback={<div className="h-16" />}>
          <BottomNav />
        </Suspense>
      )}
    </div>
  );
}
