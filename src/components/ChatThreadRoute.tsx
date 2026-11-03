"use client";

import { useParams, useSearchParams } from "next/navigation";
import ChatThread from "@/components/ChatThread";

export default function ChatThreadRoute() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  return <ChatThread id={id} productId={searchParams.get("product") ?? undefined} />;
}
