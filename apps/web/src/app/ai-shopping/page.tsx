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
import styles from "./shopai.module.css";

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

const STARTER_TITLES = ["Work & create", "Tune into your day", "Find your stride", "Everyday essentials"];
const STARTER_IMAGES = [
  "/products/items/laptops-4.jpg",
  "/products/items/headphones-2.jpg",
  "/products/items/footwear-2.jpg",
  "/products/items/shirts-2.jpg",
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
    if (history.length > 1) {
      endRef.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
        block: "nearest",
      });
    }
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
    <section className={styles.workspace} aria-label="ShopAI shopping assistant">
      <header className={styles.toolbar}>
        <Link href="/shop" className={styles.backLink}>
          <span aria-hidden="true">←</span> Back to shop
        </Link>
        <span className={styles.wordmark}>ShopAI</span>
        <label className={styles.privacy} title="Clear local chat history when you leave this page">
          <input
            type="checkbox"
            checked={forgetOnLeave}
            onChange={(e) => setForgetOnLeave(e.target.checked)}
          />
          Clear all when I leave
        </label>
      </header>

      <div className={styles.scrollArea} tabIndex={0} aria-label="Shopping conversation">
        <div className={styles.conversation}>
          {history.length <= 1 && (
            <div className={styles.welcome}>
              <span className={styles.brandMark} aria-hidden="true">V</span>
              <h1 className="font-display">ShopAI</h1>
              <p className={styles.welcomePrompt}>What are you looking for today?</p>
              <div className={styles.starters}>
                {STARTERS.map((prompt, i) => (
                  <button
                    key={prompt}
                    onClick={() => void send(prompt)}
                    className={styles.starter}
                    disabled={currentSending}
                  >
                    <Image
                      src={STARTER_IMAGES[i]}
                      alt=""
                      width={72}
                      height={72}
                      className={styles.starterImage}
                    />
                    <span>
                      <strong>{STARTER_TITLES[i]}</strong>
                      <span className={styles.starterPrompt}>{prompt}</span>
                    </span>
                    <span className={styles.starterArrow} aria-hidden="true">↗</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className={styles.messages} role="log" aria-label="Messages" aria-live="polite">
            {history.length > 1 && history.map((turn, i) =>
              turn.role === "user" ? (
                <div key={i} className={styles.userTurn}>
                  <p className="whitespace-pre-line">{turn.content}</p>
                </div>
              ) : (
                <div key={i} className={styles.assistantTurn}>
                  <span className={styles.avatar} aria-hidden="true">V</span>
                  <div className={styles.reply}>
                    <p className={styles.replyLabel}>
                      {turn.isError ? "ShopAI — couldn't reply" : "ShopAI"}
                    </p>
                    <p className="whitespace-pre-line">{turn.content}</p>
                    {turn.products && turn.products.length > 0 && (
                      <div className={styles.products}>
                        {turn.products.slice(0, 4).map((product) => (
                          <Link
                            key={product.id}
                            href={`/products/${product.slug}`}
                            className={styles.product}
                          >
                            <div className={styles.productImage}>
                              {product.primaryImageUrl ? (
                                <Image
                                  src={product.primaryImageUrl}
                                  alt={product.name}
                                  fill
                                  sizes="(max-width: 600px) 120px, 180px"
                                  className="object-contain"
                                />
                              ) : (
                                <span>No image</span>
                              )}
                            </div>
                            <div className={styles.productDetails}>
                              {product.brand && <span className={styles.productBrand}>{product.brand.name}</span>}
                              <p className={styles.productName}>{product.name}</p>
                              <p className={styles.price}>
                                {product.minPrice != null ? formatPrice(product.minPrice) : "Price not listed"}
                                <span aria-hidden="true">↗</span>
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
          </div>
          {currentSending && (
            <div className={styles.assistantTurn} role="status">
              <span className={styles.avatar} aria-hidden="true">V</span>
              <div className={styles.reply}>
                <p className={styles.replyLabel}>ShopAI</p>
                <div className={styles.thinking}>
                  <span>Finding your next favourite</span>
                  <span className="dot-bounce" />
                  <span className="dot-bounce" />
                  <span className="dot-bounce" />
                </div>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
      </div>

      <div className={styles.composerArea}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
          className={styles.composer}
        >
          <label htmlFor="shopai-message" className="sr-only">Message ShopAI</label>
          <input
            id="shopai-message"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask ShopAI anything..."
            autoComplete="off"
          />
          <button type="submit" disabled={currentSending || !input.trim()} aria-label="Send" title="Send message">
            <span aria-hidden="true">↑</span>
          </button>
        </form>
      </div>
    </section>
  );
}
