import type { ReactNode } from "react";
import { requirePageUser } from "@/lib/page-auth";
export const instant = false;
import AdminShell from "@/components/admin/AdminShell";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // Not signed in / wrong role -> /admin/login (see README for the page-auth change)
  const user = await requirePageUser(["ADMIN", "INSPECTOR"], "/admin/login");
  return <AdminShell user={user}>{children}</AdminShell>;
}