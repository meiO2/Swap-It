import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getCurrentUser } from "@/lib/session";
import type { UserRole } from "@/models/User";

export async function requirePageUser(allowedRoles?: UserRole[], loginPath = "/login") {
  await connection();

  const user = await getCurrentUser();
  if (!user) redirect(loginPath);
  if (allowedRoles && !allowedRoles.includes(user.role)) redirect("/forbidden");
  return user;
}