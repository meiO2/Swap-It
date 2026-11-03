import { Suspense } from "react";
import ChatThreadRoute from "@/components/ChatThreadRoute";

export default function ChatThreadPage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm text-ink-muted">Loading conversation…</div>}>
      <ChatThreadRoute />
    </Suspense>
  );
}
