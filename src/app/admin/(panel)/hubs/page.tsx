import { requirePageUser } from "@/lib/page-auth";
import HubSimulator from "@/components/admin/hub/HubSimulator";

export const instant = false;

export default async function SwapHubPage() {
  await requirePageUser(["ADMIN"], "/admin/login");

  return <HubSimulator />;
}