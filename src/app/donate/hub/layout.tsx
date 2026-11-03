import type { ReactNode } from "react";
import HubStepShell from "@/components/hub/HubStepShell";

export default function DonationHubLayout({ children }: { children: ReactNode }) {
  return <HubStepShell>{children}</HubStepShell>;
}
