import type { ReactNode } from "react";
import { requirePageUser } from "@/lib/page-auth";
export const instant = false;
import AdminShell from "@/components/admin/AdminShell";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requirePageUser(["ADMIN", "INSPECTOR"]);
  return <AdminShell user={user}>{children}</AdminShell>;
}
