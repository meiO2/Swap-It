import { requirePageUser } from "@/lib/page-auth";
import HubScanner from "@/components/admin/hub/HubScanner";

export const instant = false;

export default async function HubScannerPage() {
  await requirePageUser(["ADMIN"], "/admin/login");
  return <HubScanner />;
}
