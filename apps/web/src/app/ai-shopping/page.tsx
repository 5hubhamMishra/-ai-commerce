"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { useStore } from "@/lib/store";
import { buildProfile } from "@/lib/recommend";
import { respond, type AssistantTurn } from "@/lib/shopai";
import ProductCard from "@/components/ProductCard";

const STARTERS = [
  "A laptop for coding and machine learning under 80000",
  "Good headphones for the gym under 5000",
  "Best smartphone camera under 40000",
];

export default function AiShoppingPage() {
  const events = useStore((s) => s.events);
  const trackEvent = useStore((s) => s.trackEvent);
  const profile = useMemo(() => buildProfile(events), [events]);
  const [history, setHistory] = useState<AssistantTurn[]>([
    {
      role: "assistant",
      text: "Hi, I'm ShopAI. Tell me what you're shopping for — a use case, a budget, or a category — and I'll search the catalog for you.",
    },
  ]);
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const [isTyping, setIsTyping] = useState(false);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, isTyping]);

  function send(text: string) {
    if (!text.trim() || isTyping) return;
    const userTurn: AssistantTurn = { role: "user", text };
    trackEvent("AI_ASSISTANT_QUERY", { query: text });
    setHistory((h) => [...h, userTurn]);
    setInput("");
    setIsTyping(true);
    setTimeout(() => {
      setHistory((h) => {
        const reply = respond(text, h, profile);
        return [...h, reply];
      });
      setIsTyping(false);
    }, 600 + Math.random() * 500);
  }

  return (
    <div className="flex flex-col mx-auto w-full relative" style={{ minHeight: "calc(100vh - 64px)" }}>
      <div className="border-b border-[var(--clr-border)] px-4 py-4 sm:px-6 bg-[var(--clr-surface)] flex items-center gap-3 sticky top-0 z-20">
        <div className="h-9 w-9 rounded-xl bg-[var(--clr-ink)] flex items-center justify-center text-amber-500">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
        </div>
        <div>
          <p className="font-display text-lg font-semibold" style={{ color: 'var(--clr-text-primary)' }}>ShopAI</p>
          <p className="text-xs" style={{ color: 'var(--clr-text-secondary)' }}>Searches the real catalog — never invents a product</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 max-w-3xl mx-auto w-full pb-24">
        {history.length <= 1 && (
          <div className="mb-6">
            <p className="text-sm font-medium mb-3" style={{ color: 'var(--clr-text-secondary)' }}>Try asking:</p>
            <div className="flex flex-col space-y-2">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="w-full text-left rounded-2xl border border-[var(--clr-border)] px-4 py-3 text-sm font-medium hover:border-[var(--clr-accent)] hover:text-[var(--clr-accent-text)] hover:bg-[var(--clr-accent-subtle)] transition-all duration-150 flex justify-between items-center"
                  style={{ color: 'var(--clr-text-primary)' }}
                >
                  <span>{s}</span>
                  <span style={{ color: 'var(--clr-text-disabled)' }}>›</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-4">
          {history.map((turn, i) => (
             turn.role === "user" ? (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[80%] rounded-2xl rounded-br-sm px-4 py-3 text-sm text-white" style={{ background: 'var(--clr-ink)' }}>
                    <p className="whitespace-pre-line">{turn.text}</p>
                  </div>
                </div>
              ) : (
                <div key={i} className="flex gap-3">
                  <div className="h-8 w-8 shrink-0 rounded-xl bg-stone-900 flex items-center justify-center text-amber-500 text-sm">
                    ★
                  </div>
                  <div className="max-w-[85%] rounded-2xl rounded-tl-sm border border-[var(--clr-border)] px-4 py-3 bg-[var(--clr-surface)] shadow-sm">
                    <p className="text-xs font-semibold mb-2" style={{ color: 'var(--clr-accent)' }}>ShopAI</p>
                    <p className="whitespace-pre-line text-sm" style={{ color: 'var(--clr-text-primary)' }}>{turn.text}</p>
                    {turn.products && turn.products.length > 0 && (
                      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {turn.products.map((p) => (
                          <ProductCard key={p.id} product={p} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
          ))}
          {isTyping && (
             <div className="flex gap-3">
                <div className="h-8 w-8 shrink-0 rounded-xl bg-stone-900 flex items-center justify-center text-amber-500 text-sm">
                  ★
                </div>
                <div className="max-w-[85%] rounded-2xl rounded-tl-sm border border-[var(--clr-border)] px-4 py-3 bg-[var(--clr-surface)] shadow-sm">
                  <p className="text-xs font-semibold mb-2" style={{ color: 'var(--clr-accent)' }}>ShopAI</p>
                  <div className="flex items-center gap-1.5 py-2 px-1">
                    <span className="dot-bounce" style={{ background: 'var(--clr-text-disabled)' }} />
                    <span className="dot-bounce" style={{ background: 'var(--clr-text-disabled)' }} />
                    <span className="dot-bounce" style={{ background: 'var(--clr-text-disabled)' }} />
                  </div>
                </div>
              </div>
          )}
          <div ref={endRef} className="h-4" />
        </div>
      </div>

      <div className="sticky bottom-0 border-t border-[var(--clr-border)] px-4 py-3 sm:px-6 z-20" style={{ background: 'rgba(250,250,249,0.95)', backdropFilter: 'blur(8px)' }}>
        <div className="max-w-3xl mx-auto w-full">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex gap-2 rounded-2xl border border-[var(--clr-border)] bg-[var(--clr-surface)] p-1.5 shadow-sm focus-within:border-[var(--clr-accent)] focus-within:shadow-[0_0_0_3px_var(--clr-accent-subtle)] transition-all duration-200"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask ShopAI anything..."
              className="flex-1 px-3 py-2 text-sm outline-none bg-transparent"
              style={{ color: 'var(--clr-text-primary)' }}
            />
            <button type="submit" disabled={isTyping} className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white transition-colors duration-200" style={{ background: 'var(--clr-ink)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
              <span>Send</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
