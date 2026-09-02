"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { catalogApi, shopaiApi } from "@ai-commerce/api-client";
import type { ProductListItem } from "@ai-commerce/types";
import {
  createCatalogShopAIReply,
  createDemoShopAIReply,
  findDemoProductsInReply,
  getShopAIQueryContext,
  isShopAIUnavailableReply,
  type ShopAIReply,
} from "@/lib/demo-shopai";
import { mergeDemoProducts } from "@/lib/demo-catalog";
import { formatPrice } from "@/lib/format";

type ChatTurn = {
  role: "user" | "assistant";
  content: string;
  products?: ProductListItem[];
  isError?: boolean;
};

const GREETING: ChatTurn = {
  role: "assistant",
  content:
    "Hi, I'm ShopAI. Tell me what you're shopping for — a use case, a budget, or a category — and I'll search the catalog for you.",
};

const STARTERS = [
  "A laptop for coding and machine learning under 80000",
  "Good headphones for the gym under 5000",
  "Running shoes under 10000",
  "A formal shirt for the office under 2000",
];

const FORGET_SHOPAI_ON_LEAVE_KEY = "veloura-forget-shopai-on-leave";
const SHOPAI_VISIBLE_HISTORY_KEY = "veloura-shopai-visible-history";
const MAX_SAVED_EXCHANGES = 3;
const MAX_SAVED_TURNS = MAX_SAVED_EXCHANGES * 2;

function limitSavedHistory(turns: ChatTurn[]): ChatTurn[] {
  const conversationTurns = turns.filter((turn) => turn !== GREETING);
  const pendingUserTurn =
    conversationTurns.at(-1)?.role === "user" ? conversationTurns.at(-1) : null;
  if (pendingUserTurn) {
    const completedTurns = conversationTurns.slice(0, -1);
    return [
      GREETING,
      ...completedTurns.slice(-((MAX_SAVED_EXCHANGES - 1) * 2)),
      pendingUserTurn,
    ];
  }
  return [GREETING, ...conversationTurns.slice(-MAX_SAVED_TURNS)];
}

function loadVisibleHistory(storageKey: string): ChatTurn[] {
  if (typeof window === "undefined") return [GREETING];
  try {
    const saved = window.localStorage.getItem(storageKey);
    if (!saved) return [GREETING];
    const parsed = JSON.parse(saved) as ChatTurn[];
    if (!Array.isArray(parsed)) return [GREETING];
    return limitSavedHistory([
      GREETING,
      ...parsed.filter(
        (turn) =>
          (turn.role === "user" || turn.role === "assistant") &&
          typeof turn.content === "string",
      ),
    ]);
  } catch {
    return [GREETING];
  }
}

async function createCatalogBackedReply(
  history: ChatTurn[],
): Promise<ShopAIReply> {
  const context = getShopAIQueryContext(history);

  try {
    const response = await catalogApi.listProducts({
      category: context.categorySlug ?? undefined,
      search: context.categorySlug ? undefined : context.query,
      maxPrice: context.budget,
      pageSize: 8,
      sort: "name_asc",
    });
    const merged = mergeDemoProducts(response, {
      category: context.categorySlug ?? undefined,
      search: context.categorySlug ? undefined : context.query,
      maxPrice: context.budget,
      pageSize: 8,
      sort: "name_asc",
    });
    return createCatalogShopAIReply(history, merged.items);
  } catch {
    return createDemoShopAIReply(history);
  }
}

export default function AiShoppingPage() {
  const user = useStore((s) => s.user);
  const anonymousId = useStore((s) => s.anonymousId);
  const shopaiConversationId = useStore((s) => s.shopaiConversationId);
  const sendShopAIMessage = useStore((s) => s.sendShopAIMessage);
  const hydrated = useStore((s) => s.hydrated);

  const [history, setHistory] = useState<ChatTurn[]>([GREETING]);
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const [sendingUser, setSendingUser] = useState(user);
  const [sending, setSending] = useState(false);
  const [forgetOnLeave, setForgetOnLeave] = useState(
    () =>
      typeof window !== "undefined" &&
      window.localStorage.getItem(FORGET_SHOPAI_ON_LEAVE_KEY) === "true",
  );
  const historyKey = hydrated
    ? `${SHOPAI_VISIBLE_HISTORY_KEY}:${user?.id ?? "guest"}`
    : null;
  const [historyReadyKey, setHistoryReadyKey] = useState<string | null>(null);
  const loadedHistoryKey = useRef<string | null>(null);
  const hasSavedHistory = useRef(false);

  useEffect(() => {
    if (!historyKey) return;
    const switched =
      loadedHistoryKey.current !== null && loadedHistoryKey.current !== historyKey;
    const loaded = loadVisibleHistory(historyKey);
    loadedHistoryKey.current = historyKey;
    hasSavedHistory.current = loaded.length > 1;
    startTransition(() => {
      setHistory(loaded);
      setHistoryReadyKey(historyKey);
    });
    window.localStorage.removeItem(SHOPAI_VISIBLE_HISTORY_KEY);
    if (switched) useStore.setState({ shopaiConversationId: null });
  }, [historyKey]);

  useEffect(() => {
    if (!hydrated || !historyKey || historyReadyKey !== historyKey) return;
    window.localStorage.setItem(
      FORGET_SHOPAI_ON_LEAVE_KEY,
      String(forgetOnLeave),
    );
  }, [forgetOnLeave, historyKey, historyReadyKey, hydrated]);

  useEffect(() => {
    if (!hydrated || !historyKey) return;
    if (forgetOnLeave) {
      window.localStorage.removeItem(historyKey);
      return;
    }
    window.localStorage.setItem(
      historyKey,
      JSON.stringify(limitSavedHistory(history).slice(1)),
    );
  }, [forgetOnLeave, history, historyKey, historyReadyKey, hydrated]);

  useEffect(() => {
    if (!forgetOnLeave) return;
    const clearConversation = () => {
      useStore.setState({ shopaiConversationId: null });
      if (historyKey) window.localStorage.removeItem(historyKey);
      window.localStorage.removeItem(SHOPAI_VISIBLE_HISTORY_KEY);
    };
    window.addEventListener("pagehide", clearConversation);
    window.addEventListener("beforeunload", clearConversation);
    return () => {
      clearConversation();
      window.removeEventListener("pagehide", clearConversation);
      window.removeEventListener("beforeunload", clearConversation);
    };
  }, [forgetOnLeave, historyKey]);

  // Restore a previous conversation (persisted across reloads) instead of always
  // starting over — real conversations have server-side history worth keeping.
  useEffect(() => {
    if (
      !hydrated ||
      !historyKey ||
      !shopaiConversationId ||
      forgetOnLeave ||
      loadedHistoryKey.current !== historyKey ||
      hasSavedHistory.current ||
      history.length > 1
    ) {
      return;
    }
    let cancelled = false;
    shopaiApi
      .getConversation(
        shopaiConversationId,
        user?.id ? undefined : (anonymousId ?? undefined),
      )
      .then((conversation) => {
        if (cancelled || conversation.messages.length === 0) return;
        setHistory(
          limitSavedHistory([
            GREETING,
            ...conversation.messages.map((m): ChatTurn => ({
              role: m.role === "USER" ? "user" : "assistant",
              content: m.content,
            })),
          ]),
        );
      })
      .catch(() => {
        // A stale/expired conversation just falls back to the greeting-only view;
        // sendShopAIMessage() separately recovers by starting a fresh one on next send.
      });
    return () => {
      cancelled = true;
    };
  }, [
    anonymousId,
    forgetOnLeave,
    history.length,
    historyKey,
    hydrated,
    shopaiConversationId,
    user?.id,
  ]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, sending]);

  const currentSending = sending && sendingUser === user;

  async function send(text: string) {
    if (!text.trim() || currentSending) return;
    const requestUser = user;
    const requestAuthStatus = useStore.getState().authStatus;
    const isCurrent = () =>
      useStore.getState().user === requestUser &&
      useStore.getState().authStatus === requestAuthStatus;
    const nextHistory: ChatTurn[] = [
      ...history,
      { role: "user", content: text },
    ];
    setHistory(limitSavedHistory(nextHistory));
    setInput("");
    setSendingUser(requestUser);
    setSending(true);
    try {
      const reply = await sendShopAIMessage(text);
      if (!isCurrent()) return;
      const fallback = isShopAIUnavailableReply(reply.content)
        ? await createCatalogBackedReply(nextHistory)
        : null;
      if (!isCurrent()) return;
      const content = fallback?.content ?? reply.content;
      const products = fallback?.products ?? findDemoProductsInReply(content);
      if (fallback?.clearHistory) {
        setHistory([GREETING, { role: "assistant", content, products }]);
      } else {
        setHistory((h) =>
          limitSavedHistory([...h, { role: "assistant", content, products }]),
        );
      }
    } catch {
      if (!isCurrent()) return;
      const fallback = await createCatalogBackedReply(nextHistory);
      if (!isCurrent()) return;
      const assistantTurn = {
        role: "assistant" as const,
        content: fallback.content,
        products: fallback.products,
      };
      setHistory((h) =>
        fallback.clearHistory
          ? [GREETING, assistantTurn]
          : limitSavedHistory([...h, assistantTurn]),
      );
    } finally {
      if (isCurrent()) {
        setSending(false);
        setSendingUser(null);
      }
    }
  }

  return (
    <div
      className="flex flex-col mx-auto w-full relative"
      style={{ minHeight: "calc(100vh - 64px)" }}
    >
      <div className="border-b border-[var(--clr-border)] px-4 py-4 sm:px-6 bg-[var(--clr-surface)] flex flex-wrap items-center gap-3 sticky top-0 z-20">
        <div className="h-9 w-9 rounded-xl bg-[var(--clr-ink)] flex items-center justify-center text-amber-500">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
          </svg>
        </div>
        <div>
          <p
            className="font-display text-lg font-semibold"
            style={{ color: "var(--clr-text-primary)" }}
          >
            ShopAI
          </p>
          <p className="text-xs" style={{ color: "var(--clr-text-secondary)" }}>
            Searches the real catalog — never invents a product
          </p>
        </div>
        <div className="ml-auto flex flex-col items-end gap-1">
          <label className="flex items-center gap-2 rounded-full border border-[var(--clr-border)] bg-[var(--clr-surface-2)] px-3 py-2 text-xs font-medium text-[var(--clr-text-secondary)]">
            <input
              type="checkbox"
              checked={forgetOnLeave}
              onChange={(e) => setForgetOnLeave(e.target.checked)}
              className="h-4 w-4 accent-[var(--clr-accent)]"
            />
            Clear all when I leave
          </label>
          <p className="text-[11px] text-[var(--clr-text-disabled)]">
            Off keeps only the latest 3 chats.
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 max-w-3xl mx-auto w-full pb-24">
        {history.length <= 1 && (
          <div className="mb-6">
            <p
              className="text-sm font-medium mb-3"
              style={{ color: "var(--clr-text-secondary)" }}
            >
              Try asking:
            </p>
            <div className="flex flex-col space-y-2">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => void send(s)}
                  className="w-full text-left rounded-2xl border border-[var(--clr-border)] px-4 py-3 text-sm font-medium hover:border-[var(--clr-accent)] hover:text-[var(--clr-accent-text)] hover:bg-[var(--clr-accent-subtle)] transition-all duration-150 flex justify-between items-center"
                  style={{ color: "var(--clr-text-primary)" }}
                >
                  <span className="min-w-0">{s}</span>
                  <span style={{ color: "var(--clr-text-disabled)" }}>›</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-4">
          {history.map((turn, i) =>
            turn.role === "user" ? (
              <div key={i} className="flex justify-end">
                <div
                  className="max-w-[80%] rounded-2xl rounded-br-sm px-4 py-3 text-sm text-white"
                  style={{ background: "var(--clr-ink)" }}
                >
                  <p className="whitespace-pre-line">{turn.content}</p>
                </div>
              </div>
            ) : (
              <div key={i} className="flex gap-3">
                <div className="h-8 w-8 shrink-0 rounded-xl bg-stone-900 flex items-center justify-center text-amber-500 text-sm">
                  ★
                </div>
                <div
                  className="max-w-[85%] rounded-2xl rounded-tl-sm border px-4 py-3 shadow-sm"
                  style={{
                    borderColor: turn.isError
                      ? "var(--clr-error, #dc2626)"
                      : "var(--clr-border)",
                    background: "var(--clr-surface)",
                  }}
                >
                  <p
                    className="text-xs font-semibold mb-2"
                    style={{
                      color: turn.isError
                        ? "var(--clr-error, #dc2626)"
                        : "var(--clr-accent)",
                    }}
                  >
                    {turn.isError ? "ShopAI — couldn't reply" : "ShopAI"}
                  </p>
                  <p
                    className="whitespace-pre-line text-sm"
                    style={{ color: "var(--clr-text-primary)" }}
                  >
                    {turn.content}
                  </p>
                  {turn.products && turn.products.length > 0 && (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {turn.products.slice(0, 4).map((product) => (
                        <Link
                          key={product.id}
                          href={`/products/${product.slug}`}
                          className="group flex gap-3 rounded-xl border border-[var(--clr-border)] bg-[var(--clr-surface-2)] p-2 text-left transition-colors hover:border-[var(--clr-accent)]"
                        >
                          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-stone-100">
                            {product.primaryImageUrl ? (
                              <Image
                                src={product.primaryImageUrl}
                                alt={product.name}
                                fill
                                sizes="80px"
                                className="object-cover transition-transform duration-300 group-hover:scale-105"
                              />
                            ) : (
                              <div className="absolute inset-0 flex items-center justify-center px-2 text-center text-[10px] text-[var(--clr-text-disabled)]">
                                No image
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 py-1">
                            {product.brand && (
                              <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--clr-text-disabled)]">
                                {product.brand.name}
                              </p>
                            )}
                            <p className="line-clamp-2 text-sm font-semibold text-[var(--clr-text-primary)]">
                              {product.name}
                            </p>
                            <p className="mt-1 text-sm font-bold text-[var(--clr-text-primary)]">
                              {product.minPrice != null
                                ? formatPrice(product.minPrice)
                                : "Price not listed"}
                            </p>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ),
          )}
          {currentSending && (
            <div className="flex gap-3">
              <div className="h-8 w-8 shrink-0 rounded-xl bg-stone-900 flex items-center justify-center text-amber-500 text-sm">
                ★
              </div>
              <div className="max-w-[85%] rounded-2xl rounded-tl-sm border border-[var(--clr-border)] px-4 py-3 bg-[var(--clr-surface)] shadow-sm">
                <p
                  className="text-xs font-semibold mb-2"
                  style={{ color: "var(--clr-accent)" }}
                >
                  ShopAI
                </p>
                <div className="flex items-center gap-1.5 py-2 px-1">
                  <span
                    className="dot-bounce"
                    style={{ background: "var(--clr-text-disabled)" }}
                  />
                  <span
                    className="dot-bounce"
                    style={{ background: "var(--clr-text-disabled)" }}
                  />
                  <span
                    className="dot-bounce"
                    style={{ background: "var(--clr-text-disabled)" }}
                  />
                </div>
              </div>
            </div>
          )}
          <div ref={endRef} className="h-4" />
        </div>
      </div>

      <div
        className="sticky bottom-0 border-t border-[var(--clr-border)] px-4 py-3 sm:px-6 z-20"
        style={{
          background: "rgba(250,250,249,0.95)",
          backdropFilter: "blur(8px)",
        }}
      >
        <div className="max-w-3xl mx-auto w-full">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
            className="flex gap-2 rounded-2xl border border-[var(--clr-border)] bg-[var(--clr-surface)] p-1.5 shadow-sm focus-within:border-[var(--clr-accent)] focus-within:shadow-[0_0_0_3px_var(--clr-accent-subtle)] transition-all duration-200"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask ShopAI anything..."
              className="min-w-0 flex-1 px-3 py-2 text-sm outline-none bg-transparent"
              style={{ color: "var(--clr-text-primary)" }}
            />
            <button
              type="submit"
              disabled={currentSending}
              className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white transition-colors duration-200"
              style={{ background: "var(--clr-ink)" }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m22 2-7 20-4-9-9-4Z" />
                <path d="M22 2 11 13" />
              </svg>
              <span>Send</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
