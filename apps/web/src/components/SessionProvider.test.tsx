import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as apiClient from "@ai-commerce/api-client";
import { SESSION_HINT_KEY, useStore } from "@/lib/store";
import SessionProvider from "./SessionProvider";

describe("SessionProvider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    useStore.getState().clearSession();
  });

  it("does not refresh a visitor with no session hint", async () => {
    const refresh = vi.spyOn(apiClient, "refreshAccessToken");
    const root = createRoot(document.createElement("div"));

    await act(async () => root.render(<SessionProvider />));
    await vi.waitFor(() =>
      expect(useStore.getState().authStatus).toBe("unauthenticated"),
    );

    expect(refresh).not.toHaveBeenCalled();
    root.unmount();
  });

  it("does not restore an account after the session is cleared", async () => {
    window.localStorage.setItem(SESSION_HINT_KEY, "true");
    let resolveRefresh!: (token: string | null) => void;
    const refresh = new Promise<string | null>((resolve) => {
      resolveRefresh = resolve;
    });
    vi.spyOn(apiClient, "refreshAccessToken").mockReturnValue(refresh);
    const me = vi.spyOn(apiClient.authApi, "me");
    vi.spyOn(apiClient.usersApi, "getProfile");

    const root = createRoot(document.createElement("div"));
    await act(async () => root.render(<SessionProvider />));
    await vi.waitFor(() =>
      expect(apiClient.refreshAccessToken).toHaveBeenCalled(),
    );

    useStore.getState().clearSession();
    resolveRefresh("stale-token");
    await act(async () => {
      await refresh;
    });

    expect(useStore.getState().user).toBeNull();
    expect(useStore.getState().accessToken).toBeNull();
    expect(me).not.toHaveBeenCalled();
    root.unmount();
  });
});
