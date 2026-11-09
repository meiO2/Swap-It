
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Bell,
  Leaf,
  PackageCheck,
  ShieldAlert,
  Sparkles,
  WalletCards,
  CheckCheck,
} from "lucide-react";
import { useSwapStore } from "@/store/useSwapStore";
import { formatShortDate } from "@/lib/format";
import { apiRequest } from "@/lib/api";
import { useEffect, useState } from "react";

const icons = {
  wallet: WalletCards,
  order: PackageCheck,
  qc: ShieldAlert,
  match: Sparkles,
  donation: Leaf,
};

type ServerNotification = {
  id: string;
  title: string;
  detail: string;
  createdAt: string;
  href: string;
  kind: "qc" | "order";
  isRead: boolean;
  sender: {
    id: string;
    name: string;
    avatarUrl: string | null;
  } | null;
};

type NotificationView = {
  id: string;
  title: string;
  detail: string;
  createdAt: string;
  href: string;
  kind: keyof typeof icons;
  isRead: boolean;
  time: string;
  sender?: ServerNotification["sender"];
};

export default function NotificationsPage() {
  const router = useRouter();

  const donationNotifications = useSwapStore(
    (state) => state.notifications
  );

  const [serverNotifications, setServerNotifications] = useState<
    ServerNotification[]
  >([]);

  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    let cancelled = false;

    apiRequest<ServerNotification[]>("/api/notifications")
      .then((data) => {
        if (!cancelled) setServerNotifications(data);
      })
      .catch((error: unknown) => {
        console.error("Could not load notifications.", error);
        if (!cancelled) {
          setActionError("Could not load your notifications.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const allNotifications: NotificationView[] = [
    ...serverNotifications.map((notification) => ({
      ...notification,
      time: formatShortDate(notification.createdAt),
    })),

    // Local Zustand notifications don't have persistent read status yet.
    ...donationNotifications.map((notification) => ({
      ...notification,
      time: formatShortDate(notification.createdAt),
      isRead: true,
    })),
  ].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() -
      new Date(a.createdAt).getTime()
  );

  const unreadCount = serverNotifications.filter(
    (notification) => !notification.isRead
  ).length;

  async function markAsRead(id: string) {
    await apiRequest("/api/notifications", {
      method: "PATCH",
      body: JSON.stringify({ id }),
    });

    setServerNotifications((current) =>
      current.map((notification) =>
        notification.id === id
          ? { ...notification, isRead: true }
          : notification
      )
    );
  }

  async function markAllAsRead() {
    if (unreadCount === 0 || updating) return;

    setUpdating(true);
    setActionError("");

    try {
      await apiRequest("/api/notifications", {
        method: "PATCH",
        body: JSON.stringify({ markAllRead: true }),
      });

      setServerNotifications((current) =>
        current.map((notification) => ({
          ...notification,
          isRead: true,
        }))
      );
    } catch (error) {
      console.error("Could not mark notifications as read.", error);
      setActionError("Could not update notifications. Please try again.");
    } finally {
      setUpdating(false);
    }
  }

  async function handleNotificationClick(
    event: React.MouseEvent<HTMLAnchorElement>,
    notification: NotificationView
  ) {
    event.preventDefault();

    if (!notification.isRead) {
      try {
        await markAsRead(notification.id);
      } catch (error) {
        console.error("Could not mark notification as read.", error);
      }
    }

    router.push(notification.href);
  }

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
          <h1 className="text-xl font-semibold text-ink">
            Notifications
          </h1>
          <p className="text-xs text-ink-muted">
            Important updates from your SwapIt activity
          </p>
        </div>

        <div className="relative ml-auto">
          <Bell className="text-primary" size={20} />
          {unreadCount > 0 && (
            <span className="absolute -right-2 -top-2 flex size-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </div>
      </header>

      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs font-medium text-ink-muted">
          {unreadCount > 0
            ? `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`
            : "You're all caught up!"}
        </p>

        {unreadCount > 0 && (
          <button
            type="button"
            onClick={markAllAsRead}
            disabled={updating}
            className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline disabled:opacity-50"
          >
            <CheckCheck size={15} />
            {updating ? "Updating..." : "Mark all as read"}
          </button>
        )}
      </div>

      {actionError && (
        <p className="mb-3 rounded-xl bg-red-50 p-3 text-xs text-red-600">
          {actionError}
        </p>
      )}

      <div className="space-y-2">
        {loading ? (
          <p className="rounded-2xl bg-mint-50 p-5 text-center text-sm text-ink-muted">
            Loading notifications...
          </p>
        ) : allNotifications.length === 0 ? (
          <p className="rounded-2xl bg-mint-50 p-5 text-center text-sm text-ink-muted">
            No notifications yet.
          </p>
        ) : (
          allNotifications.map((notification) => {
            const Icon = icons[notification.kind];

            return (
              <Link
                key={notification.id}
                href={notification.href}
                onClick={(event) =>
                  void handleNotificationClick(event, notification)
                }
                className={`flex items-start gap-3 rounded-2xl p-4 shadow-card transition hover:bg-mint-50 ${
                  notification.isRead
                    ? "bg-white"
                    : "border border-primary/20 bg-mint-50/70"
                }`}
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-mint-50 text-primary">
                  <Icon size={18} />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-xs font-semibold text-ink">
                      {notification.title === "New message" && notification.sender
                        ? `New message from ${notification.sender.name}`
                        : notification.title}

                      {!notification.isRead && (
                        <span className="size-2 shrink-0 rounded-full bg-primary" />
                      )}
                    </span>

                    <span className="shrink-0 text-[9px] text-ink-muted">
                      {notification.time}
                    </span>
                  </span>

                  <span className="mt-1 block text-[10px] leading-relaxed text-ink-muted">
                    {notification.detail}
                  </span>
                </span>
              </Link>
            );
          })
        )}
      </div>
    </main>
  );
}
