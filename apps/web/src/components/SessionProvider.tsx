"use client";

import { useEffect } from "react";
import { authApi, refreshAccessToken } from "@ai-commerce/api-client";
import { useStore } from "@/lib/store";

/**
 * The access token is deliberately never persisted to localStorage (see store.ts's
 * `partialize`), so a full page reload starts with none in memory. This silently exchanges
 * the httpOnly refresh cookie (sent automatically via `credentials: 'include'`) for a fresh
 * one on mount, so a signed-in visitor doesn't get bounced to "Sign in" on every reload.
 *
 * Uses the shared, de-duplicated `refreshAccessToken()` rather than calling `authApi.refresh()`
 * directly: a page that also fires its own authenticated request on mount (e.g. an order
 * detail view) can 401 before this restore finishes and trigger its own automatic refresh —
 * two concurrent refreshes off the same rotating cookie makes the server treat the second as
 * token theft and revoke the whole session, logging the user straight back out.
 */
export default function SessionProvider() {
  useEffect(() => {
    let cancelled = false;

    async function restore() {
      useStore.setState({ authStatus: "checking" });
      try {
        const accessToken = await refreshAccessToken();
        if (cancelled) return;
        if (!accessToken) throw new Error("Session restore failed");
        useStore.setState({ accessToken });
        const me = await authApi.me();
        if (cancelled) return;
        useStore.setState({ user: me, authStatus: "authenticated" });
        void useStore.getState().fetchServerCart();
        void useStore.getState().fetchServerWishlist();
        void useStore.getState().fetchBehavioralProfile();
      } catch {
        if (cancelled) return;
        useStore.getState().clearSession();
      }
    }

    void restore();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
