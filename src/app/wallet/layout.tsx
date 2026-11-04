import type { ReactNode } from "react";
import { requirePageUser } from "@/lib/page-auth";
export const instant = false;

export default async function WalletLayout({ children }: { children: ReactNode }) {
  await requirePageUser();
  return children;
}
