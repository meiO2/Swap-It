
"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Send, ShieldCheck } from "lucide-react";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { catalogProducts } from "@/data/mock";
import StatusBadge from "@/components/ui/StatusBadge";
import { useSwapStore } from "@/store/useSwapStore";

interface Participant {
  _id: string;
  name: string;
  email?: string;
  avatarUrl?: string;
}

interface Conversation {
  _id: string;
  participants: Participant[];
  lastMessage?: string;
  lastMessageAt?: string;
}

interface Message {
  _id: string;
  conversationId: string;
  senderId: Participant | string;
  text: string;
  readAt: string | null;
  createdAt: string;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

function getSenderId(sender: Participant | string): string {
  return typeof sender === "string" ? sender : sender._id;
}

function formatMessageTime(dateString: string) {
  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ChatThread({
  id,
  productId,
}: {
  id: string;
  productId?: string;
}) {
  const pinnedProduct = catalogProducts.find(
    (product) => product.id === productId
  );

  const swapStatus = useSwapStore((state) => state.swapStatuses[id]);
  const updateSwapStatus = useSwapStore((state) => state.updateSwapStatus);

  const [person, setPerson] = useState<Participant | null>(null);
  const [currentUserId, setCurrentUserId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchMessages = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/conversations/${id}/messages`,
        { credentials: "include" }
      );

      const result: ApiResponse<Message[]> = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Failed to load messages.");
      }

      setMessages(result.data || []);
    } catch (err) {
      console.error("Fetch messages error:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Unable to load messages."
      );
    }
  }, [id]);

  // Load current user and conversation details.
  useEffect(() => {
    let active = true;

    async function initializeChat() {
      try {
        setLoading(true);
        setError("");

        const [userResponse, conversationResponse] = await Promise.all([
          fetch("/api/auth/me", { credentials: "include" }),
          fetch("/api/conversations", { credentials: "include" }),
        ]);

        const userResult = await userResponse.json();
        const conversationResult: ApiResponse<Conversation[]> =
          await conversationResponse.json();

        if (!userResponse.ok || !userResult.success) {
          throw new Error("Please log in to access your messages.");
        }

        if (!conversationResponse.ok || !conversationResult.success) {
          throw new Error(
            conversationResult.message || "Failed to load conversation."
          );
        }

        if (!active) return;

        const userId = userResult.data.id;
        setCurrentUserId(userId);

        const conversation = conversationResult.data.find(
          (item) => item._id === id
        );

        if (!conversation) {
          throw new Error("Conversation not found.");
        }

        const otherPerson = conversation.participants.find(
          (participant) => participant._id !== userId
        );

        if (!otherPerson) {
          throw new Error("Conversation participant not found.");
        }

        setPerson(otherPerson);

        const messageResponse = await fetch(
          `/api/conversations/${id}/messages`,
          { credentials: "include" }
        );

        const messageResult: ApiResponse<Message[]> =
          await messageResponse.json();

        if (!messageResponse.ok || !messageResult.success) {
          throw new Error(
            messageResult.message || "Failed to load messages."
          );
        }

        if (active) {
          setMessages(messageResult.data || []);
        }
      } catch (err) {
        console.error("Initialize chat error:", err);

        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : "Something went wrong."
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    initializeChat();

    return () => {
      active = false;
    };
  }, [id]);

  // Refresh messages periodically to receive new messages.
  useEffect(() => {
    if (!currentUserId || loading) return;

    const interval = window.setInterval(() => {
      fetchMessages();
    }, 5000);

    return () => window.clearInterval(interval);
  }, [currentUserId, loading, fetchMessages]);

  // Keep the latest message visible.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const text = draft.trim();

    if (!text || sending) return;

    try {
      setSending(true);
      setError("");

      const response = await fetch(
        `/api/conversations/${id}/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({ text }),
        }
      );

      const result: ApiResponse<Message> = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Failed to send message.");
      }

      setDraft("");
      await fetchMessages();
    } catch (err) {
      console.error("Send message error:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Unable to send message."
      );
    } finally {
      setSending(false);
    }
  }

  const initials = person?.name
    ?.split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return (
    <main className="flex min-h-[calc(100vh-7rem)] flex-col px-4 pt-4">
      <header className="flex items-center gap-3 border-b border-border pb-3">
        <Link
          href="/chat"
          aria-label="Back to messages"
          className="rounded-full p-2 text-ink-muted hover:bg-mint-50"
        >
          <ArrowLeft size={20} />
        </Link>

        <div className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-mint-50 text-sm font-semibold text-primary">
          {person?.avatarUrl ? (
            <Image
              src={person.avatarUrl}
              alt=""
              fill
              sizes="40px"
              unoptimized
              className="object-cover"
            />
          ) : (
            initials || "?"
          )}
        </div>

        <div>
          <h1 className="text-sm font-semibold text-ink">
            {person?.name || "SwapIt member"}
          </h1>

          <p className="flex items-center gap-1 text-[10px] text-primary">
            <ShieldCheck size={12} />
            SwapIt member
          </p>
        </div>
      </header>

      {pinnedProduct && (
        <Link
          href={`/products/${pinnedProduct.id}`}
          className="mt-3 flex items-center gap-3 rounded-2xl bg-mint-50 p-3"
        >
          <div className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-white">
            <Image
              src={pinnedProduct.image}
              alt={pinnedProduct.imageAlt}
              fill
              sizes="56px"
              className="object-cover"
            />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-[10px] text-ink-muted">Product shared</p>
            <p className="truncate text-xs font-semibold text-ink">
              {pinnedProduct.name}
            </p>
            <p className="mt-0.5 text-xs font-semibold text-primary">
              {pinnedProduct.gpPrice.toLocaleString("id-ID")} GP
            </p>
          </div>

          <span className="text-[10px] font-semibold text-primary">
            View
          </span>
        </Link>
      )}

      <div
        className="flex-1 space-y-3 overflow-y-auto py-5"
        aria-live="polite"
      >
        {loading ? (
          <p className="py-8 text-center text-xs text-ink-muted">
            Loading messages...
          </p>
        ) : error && messages.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-xs text-red-500">{error}</p>
            <button
              type="button"
              onClick={fetchMessages}
              className="mt-2 text-xs font-semibold text-primary"
            >
              Try again
            </button>
          </div>
        ) : messages.length === 0 ? (
          <p className="py-8 text-center text-xs text-ink-muted">
            No messages yet. Say hello!
          </p>
        ) : (
          messages.map((message) => {
            const own = getSenderId(message.senderId) === currentUserId;

            return (
              <div
                key={message._id}
                className={`flex ${own ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 ${
                    own
                      ? "rounded-br-md bg-primary text-white"
                      : "rounded-bl-md bg-mint-50 text-ink"
                  }`}
                >
                  <p className="text-sm leading-relaxed break-words">
                    {message.text}
                  </p>

                  <p
                    className={`mt-1 text-right text-[9px] ${
                      own ? "text-white/75" : "text-ink-muted"
                    }`}
                  >
                    {formatMessageTime(message.createdAt)}
                    {own && message.readAt ? " · Read" : ""}
                  </p>
                </div>
              </div>
            );
          })
        )}

        <div ref={bottomRef} />
      </div>

      <div className="sticky bottom-24 bg-white pb-3 pt-2">
        {!swapStatus ? (
          <button
            type="button"
            onClick={() => updateSwapStatus(id, "Proposed")}
            className="mb-2 h-9 w-full rounded-full border border-primary/30 text-xs font-semibold text-primary hover:bg-mint-50"
          >
            Propose swap
          </button>
        ) : (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-xl bg-mint-50 p-2.5">
            <span className="flex items-center gap-2 text-[10px] font-medium text-ink">
              Swap status <StatusBadge status={swapStatus} />
            </span>

            {swapStatus === "Proposed" && (
              <button
                type="button"
                onClick={() => updateSwapStatus(id, "Accepted")}
                className="text-[10px] font-semibold text-primary"
              >
                Accept
              </button>
            )}

            {swapStatus === "Accepted" && (
              <button
                type="button"
                onClick={() => updateSwapStatus(id, "Completed")}
                className="text-[10px] font-semibold text-success"
              >
                Mark complete
              </button>
            )}
          </div>
        )}

        {error && messages.length > 0 && (
          <p className="mb-2 text-center text-[10px] text-red-500">
            {error}
          </p>
        )}

        <form
          onSubmit={sendMessage}
          className="flex h-11 items-center gap-2 rounded-full border border-border bg-white pl-4 pr-1.5"
        >
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            aria-label="Write a message"
            placeholder="Write a message..."
            maxLength={5000}
            disabled={loading || sending || !currentUserId}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-muted disabled:opacity-50"
          />

          <button
            type="submit"
            aria-label="Send message"
            disabled={!draft.trim() || sending || loading}
            className="flex size-8 items-center justify-center rounded-full bg-primary text-white hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send size={15} />
          </button>
        </form>
      </div>
    </main>
  );
}
