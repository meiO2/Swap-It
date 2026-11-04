import type { ReactNode } from "react";
import { requirePageUser } from "@/lib/page-auth";
export const instant = false;

export default async function SellLayout({ children }: { children: ReactNode }) {
  await requirePageUser();
  return children;
}
