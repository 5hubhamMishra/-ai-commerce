"use client";

import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Notification } from "@ai-commerce/types";
import { notificationsApi } from "@ai-commerce/api-client";
import { SkeletonBlock, SkeletonText } from "@/components/Skeleton";
import { useStore } from "@/lib/store";

const notificationDate = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function invalidate(operation: { current: number }) {
  operation.current++;
}

function NotificationLink({ notification }: { notification: Notification }) {
  if (notification.relatedType !== "order" || !notification.relatedId) return null;
  return (
    <Link
      href={`/orders/${encodeURIComponent(notification.relatedId)}`}
      className="text-sm font-medium text-amber-700 hover:underline"
    >
      View order
    </Link>
  );
}

export default function NotificationsPage() {
  const hydrated = useStore((s) => s.hydrated);
  const authStatus = useStore((s) => s.authStatus);
  const userId = useStore((s) => s.user?.id ?? null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [actionError, setActionError] = useState(false);
  const notificationOperation = useRef(0);

  const loadNotifications = useCallback(async () => {
    const operation = ++notificationOperation.current;
    setStatus("loading");
    try {
      const next = await notificationsApi.list();
      if (operation !== notificationOperation.current) return;
      setNotifications(next);
      setStatus("idle");
    } catch {
      if (operation === notificationOperation.current) setStatus("error");
    }
  }, []);

  useEffect(() => {
    if (authStatus !== "authenticated" || !userId) return;
    startTransition(() => {
      setNotifications([]);
      setStatus("loading");
      setActionError(false);
    });
    startTransition(() => void loadNotifications());
    const interval = window.setInterval(() => void loadNotifications(), 60_000);
    return () => {
      invalidate(notificationOperation);
      window.clearInterval(interval);
    };
  }, [authStatus, loadNotifications, userId]);

  async function markRead(id: string) {
    const operation = ++notificationOperation.current;
    setActionError(false);
    try {
      const updated = await notificationsApi.markRead(id);
      if (operation !== notificationOperation.current) return;
      setNotifications((current) =>
        current.map((notification) =>
          notification.id === id ? { ...notification, readAt: updated.readAt } : notification,
        ),
      );
    } catch {
      if (operation === notificationOperation.current) setActionError(true);
    }
  }

  async function markAllRead() {
    const operation = ++notificationOperation.current;
    setActionError(false);
    try {
      await notificationsApi.markAllRead();
      if (operation !== notificationOperation.current) return;
      setNotifications((current) =>
        current.map((notification) => ({
          ...notification,
          readAt: notification.readAt ?? new Date().toISOString(),
        })),
      );
    } catch {
      if (operation === notificationOperation.current) setActionError(true);
    }
  }

  if (!hydrated || authStatus === "idle" || authStatus === "checking") {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <SkeletonText className="h-7 w-48 mb-6" />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <SkeletonBlock key={index} className="h-28 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (authStatus !== "authenticated") {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-semibold">Your notifications</h1>
        <p className="mt-2 text-sm text-[var(--clr-text-secondary)]">Sign in to see updates about your orders and account.</p>
        <Link href="/login?redirect=/notifications" className="mt-5 btn btn-accent inline-flex">Sign in</Link>
      </div>
    );
  }

  const unreadCount = notifications.filter((notification) => !notification.readAt).length;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Your notifications</h1>
          <p className="mt-1 text-sm text-[var(--clr-text-secondary)]">
            {unreadCount === 0 ? "You are all caught up." : `${unreadCount} unread update${unreadCount === 1 ? "" : "s"}`}
          </p>
        </div>
        {unreadCount > 0 && (
          <button onClick={() => void markAllRead()} className="btn btn-ghost text-sm shrink-0">
            Mark all as read
          </button>
        )}
      </div>

      {actionError && <p className="mt-4 text-sm text-red-700">Couldn&apos;t update your notifications. Please try again.</p>}
      {status === "error" ? (
        <div className="mt-6 border border-[var(--clr-border)] p-6 text-center">
          <p className="text-sm text-[var(--clr-text-secondary)]">Couldn&apos;t load your notifications.</p>
          <button onClick={() => void loadNotifications()} className="mt-4 btn btn-accent text-sm">Try again</button>
        </div>
      ) : status === "loading" && notifications.length === 0 ? (
        <div className="mt-6 space-y-3" aria-busy="true">
          {Array.from({ length: 3 }).map((_, index) => (
            <SkeletonBlock key={index} className="h-28 w-full" />
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <div className="mt-6 border border-[var(--clr-border)] p-10 text-center">
          <h2 className="font-display text-lg font-semibold">No notifications yet</h2>
          <p className="mt-2 text-sm text-[var(--clr-text-secondary)]">Order and account updates will appear here.</p>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {notifications.map((notification) => (
            <article
              key={notification.id}
              className={`border border-[var(--clr-border)] p-4 sm:p-5 ${notification.readAt ? "bg-[var(--clr-surface)]" : "bg-amber-50/50"}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-[var(--clr-text-primary)]">{notification.title}</h2>
                  <p className="mt-1 text-sm leading-relaxed text-[var(--clr-text-secondary)]">{notification.body}</p>
                  <time dateTime={notification.createdAt} className="mt-2 block text-xs text-[var(--clr-text-disabled)]">
                    {notificationDate.format(new Date(notification.createdAt))}
                  </time>
                </div>
                {!notification.readAt && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-amber-600" aria-label="Unread" />}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-4">
                <NotificationLink notification={notification} />
                {!notification.readAt && (
                  <button onClick={() => void markRead(notification.id)} className="text-sm text-[var(--clr-text-secondary)] hover:text-[var(--clr-text-primary)] hover:underline">
                    Mark as read
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
