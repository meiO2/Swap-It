
"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Search, MessageCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

interface Participant {
  _id: string;
  name: string;
  email: string;
  avatarUrl?: string;
}

interface Conversation {
  _id: string;
  participants: Participant[];
  lastMessage?: string;
  lastMessageAt?: string;
  updatedAt?: string;
}

interface ConversationResponse {
  success: boolean;
  data: Conversation[];
  message?: string;
}

interface UserResponse {
  success: boolean;
  data: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  message?: string;
}

function formatTime(dateString?: string) {
  if (!dateString) return "";

  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) return "";

  const today = new Date();

  const isToday =
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();

  if (isToday) {
    return date.toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return date.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
  });
}

export default function ChatListPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadConversations() {
      try {
        setLoading(true);
        setError("");

        const [userResponse, conversationResponse] = await Promise.all([
          fetch("/api/auth/me", {
            credentials: "include",
          }),
          fetch("/api/conversations", {
            credentials: "include",
          }),
        ]);

        const userResult: UserResponse = await userResponse.json();
        const conversationResult: ConversationResponse =
          await conversationResponse.json();

        if (!userResponse.ok || !userResult.success) {
          throw new Error(userResult.message || "Please log in to view messages.");
        }

        if (
          !conversationResponse.ok ||
          !conversationResult.success
        ) {
          throw new Error(
            conversationResult.message || "Failed to load conversations."
          );
        }

        setCurrentUserId(userResult.data.id);
        setConversations(conversationResult.data || []);
      } catch (err) {
        console.error("Load conversations error:", err);

        setError(
          err instanceof Error
            ? err.message
            : "Something went wrong while loading messages."
        );
      } finally {
        setLoading(false);
      }
    }

    loadConversations();
  }, []);

  const filteredConversations = useMemo(() => {
    const query = search.trim().toLowerCase();

    return conversations.filter((conversation) => {
      const otherPerson = conversation.participants.find(
        (participant) => participant._id !== currentUserId
      );

      if (!otherPerson) return false;

      return (
        otherPerson.name.toLowerCase().includes(query) ||
        (conversation.lastMessage || "").toLowerCase().includes(query)
      );
    });
  }, [conversations, currentUserId, search]);

  return (
    <main className="px-4 pb-6 pt-5">
      <header className="mb-5 flex items-center gap-3">
        <Link
          href="/"
          aria-label="Back home"
          className="rounded-full p-2 text-ink-muted hover:bg-mint-50"
        >
          <ArrowLeft size={20} />
        </Link>

        <div>
          <h1 className="text-xl font-semibold text-ink">Messages</h1>
          <p className="text-xs text-ink-muted">
            Say hello to the SwapIt community
          </p>
        </div>
      </header>

      <label className="mb-4 flex h-11 items-center gap-2 rounded-full border border-border bg-white px-3.5 text-ink-muted">
        <Search size={17} />

        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Search conversations"
          placeholder="Search conversations"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-muted"
        />
      </label>

      <div className="space-y-1">
        {loading ? (
          <div className="py-12 text-center text-sm text-ink-muted">
            Loading conversations...
          </div>
        ) : error ? (
          <div className="rounded-2xl bg-red-50 p-4 text-center">
            <p className="text-sm text-red-600">{error}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-2 text-xs font-semibold text-primary"
            >
              Try again
            </button>
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="flex flex-col items-center rounded-2xl bg-mint-50 px-5 py-10 text-center">
            <MessageCircle size={32} className="text-primary" />

            <h2 className="mt-3 text-sm font-semibold text-ink">
              {search ? "No conversations found" : "No messages yet"}
            </h2>

            <p className="mt-1 max-w-[240px] text-xs leading-relaxed text-ink-muted">
              {search
                ? "Try searching with another name or message."
                : "When you chat with another SwapIt member, your conversations will appear here."}
            </p>
          </div>
        ) : (
          filteredConversations.map((conversation) => {
            const person = conversation.participants.find(
              (participant) => participant._id !== currentUserId
            );

            if (!person) return null;

            const initials = person.name
              .split(" ")
              .filter(Boolean)
              .slice(0, 2)
              .map((part) => part[0])
              .join("")
              .toUpperCase();

            return (
              <Link
                key={conversation._id}
                href={`/chat/${conversation._id}`}
                className="flex items-center gap-3 rounded-2xl p-3 transition hover:bg-mint-50"
              >
                <div className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-mint-50 text-sm font-semibold text-primary">
                  {person.avatarUrl ? (
                    <Image
                      src={person.avatarUrl}
                      alt=""
                      fill
                      sizes="48px"
                      unoptimized
                      className="object-cover"
                    />
                  ) : (
                    initials
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="truncate text-sm font-semibold text-ink">
                      {person.name}
                    </h2>

                    <span className="shrink-0 text-[10px] text-ink-muted">
                      {formatTime(
                        conversation.lastMessageAt ||
                          conversation.updatedAt
                      )}
                    </span>
                  </div>

                  <div className="mt-1 flex items-center justify-between gap-2">
                    <p className="truncate text-xs text-ink-muted">
                      {conversation.lastMessage || "Start a conversation"}
                    </p>
                  </div>
                </div>
              </Link>
            );
          })
        )}
      </div>

      <div className="mt-5 rounded-2xl bg-mint-50 p-4">
        <h2 className="text-sm font-semibold text-ink">
          A little kindness goes a long way
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-ink-muted">
          Keep conversations friendly and arrange swaps in a safe public place.
        </p>
      </div>
    </main>
  );
}
