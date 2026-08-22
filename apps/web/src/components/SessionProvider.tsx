"use client";

import { useEffect } from "react";
import { authApi } from "@ai-commerce/api-client";
import { useStore } from "@/lib/store";

/**
 * The access token is deliberately never persisted to localStorage (see store.ts's
 * `partialize`), so a full page reload starts with none in memory. This silently exchanges
 * the httpOnly refresh cookie (sent automatically via `credentials: 'include'`) for a fresh
 * one on mount, so a signed-in visitor doesn't get bounced to "Sign in" on every reload.
 */
export default function SessionProvider() {
  useEffect(() => {
    let cancelled = false;

    async function restore() {
      useStore.setState({ authStatus: "checking" });
      try {
        const tokens = await authApi.refresh();
        if (cancelled) return;
        useStore.setState({ accessToken: tokens.accessToken });
        const me = await authApi.me();
        if (cancelled) return;
        useStore.setState({ user: me, authStatus: "authenticated" });
        void useStore.getState().fetchServerCart();
        void useStore.getState().fetchServerWishlist();
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
