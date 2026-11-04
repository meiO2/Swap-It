import type { ReactNode } from "react";
import { requirePageUser } from "@/lib/page-auth";
export const instant = false;

export default async function ChatLayout({ children }: { children: ReactNode }) {
  await requirePageUser();
  return children;
}
