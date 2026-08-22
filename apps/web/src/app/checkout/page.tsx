"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Address, ShippingMethodQuote } from "@ai-commerce/types";
import { shippingApi } from "@ai-commerce/api-client";
import { useStore } from "@/lib/store";
import { formatPrice } from "@/lib/format";
import { SkeletonBlock, SkeletonText } from "@/components/Skeleton";

type NewAddressFields = {
  label: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

const EMPTY_ADDRESS: NewAddressFields = {
  label: "",
  line1: "",
  line2: "",
  city: "",
  state: "",
  postalCode: "",
  country: "India",
};

function AddressForm({
  value,
  onChange,
}: {
  value: NewAddressFields;
  onChange: (next: NewAddressFields) => void;
}) {
  function field(key: keyof NewAddressFields) {
    return {
      value: value[key],
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [key]: e.target.value }),
    };
  }
  const inputClass =
    "rounded-xl border border-[var(--clr-border)] px-3.5 py-2.5 text-sm outline-none w-full focus:border-[var(--clr-accent)] focus:ring-1 focus:ring-[var(--clr-accent)] transition-all bg-[var(--clr-surface)]";
  return (
    <div className="space-y-3">
      <input {...field("label")} placeholder="Label (e.g. Home, Work) — optional" className={inputClass} />
      <input {...field("line1")} required placeholder="House no, building, street" className={inputClass} />
      <input {...field("line2")} placeholder="Landmark, area — optional" className={inputClass} />
      <div className="grid grid-cols-2 gap-3">
        <input {...field("city")} required placeholder="City" className={inputClass} />
        <input {...field("state")} required placeholder="State" className={inputClass} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <input {...field("postalCode")} required placeholder="PIN code" className={inputClass} />
        <input {...field("country")} required placeholder="Country" className={inputClass} />
      </div>
    </div>
  );
}

function AddressCard({
  address,
  selected,
  onSelect,
}: {
  address: Address;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left rounded-2xl border p-4 transition-colors ${
        selected ? "border-[var(--clr-accent)] bg-[var(--clr-surface-2)]" : "border-[var(--clr-border)] hover:border-[var(--clr-border-strong)]"
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2"
          style={{ borderColor: selected ? "var(--clr-accent)" : "var(--clr-border-strong)" }}
        >
          {selected && <span className="h-2 w-2 rounded-full" style={{ background: "var(--clr-accent)" }} />}
        </span>
        {address.label && <span className="text-xs font-bold uppercase tracking-widest text-[var(--clr-text-disabled)]">{address.label}</span>}
        {address.isDefault && <span className="badge badge-subtle text-[10px]">Default</span>}
      </div>
      <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--clr-text-primary)" }}>
        {address.line1}{address.line2 ? `, ${address.line2}` : ""}, {address.city}, {address.state} {address.postalCode}, {address.country}
      </p>
    </button>
  );
}

export default function CheckoutPage() {
  const router = useRouter();
  const serverCart = useStore((s) => s.serverCart);
  const addresses = useStore((s) => s.serverAddresses);
  const addressesStatus = useStore((s) => s.serverAddressesStatus);
  const fetchServerAddresses = useStore((s) => s.fetchServerAddresses);
  const createServerAddress = useStore((s) => s.createServerAddress);
  const placeServerOrder = useStore((s) => s.placeServerOrder);
  const trackEvent = useStore((s) => s.trackEvent);
  const trackRealEvent = useStore((s) => s.trackRealEvent);
  const hydrated = useStore((s) => s.hydrated);

  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [newAddress, setNewAddress] = useState<NewAddressFields>(EMPTY_ADDRESS);

  const [quotes, setQuotes] = useState<ShippingMethodQuote[] | null>(null);
  const [quotesLoading, setQuotesLoading] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);

  const [placing, setPlacing] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lines = serverCart?.items ?? [];
  const subtotal = serverCart?.subtotal ?? 0;

  useEffect(() => {
    if (hydrated && lines.length > 0) {
      trackEvent("CHECKOUT_STARTED", {});
      trackRealEvent("CHECKOUT_STARTED");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  useEffect(() => {
    if (hydrated && lines.length > 0) void fetchServerAddresses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  // Both "which address is selected" and "show the add-address form" have a derived
  // default (the account's default address once addresses load; the form when there
  // are none yet) that only needs to fall back — not fight — an explicit user pick, so
  // they're computed here rather than synced into state via an effect.
  const effectiveAddressId = useMemo(() => {
    if (selectedAddressId) return selectedAddressId;
    if (!addresses || addresses.length === 0) return null;
    return addresses.find((a) => a.isDefault)?.id ?? addresses[0].id;
  }, [addresses, selectedAddressId]);
  const showAddForm = addingNew || (addresses !== null && addresses.length === 0);

  // Fetch a shipping quote whenever the selected address changes.
  useEffect(() => {
    if (!effectiveAddressId) return;
    let cancelled = false;
    startTransition(() => {
      setQuotesLoading(true);
      setQuotes(null);
      setSelectedMethod(null);
    });
    shippingApi
      .quote(effectiveAddressId)
      .then((result) => {
        if (cancelled) return;
        setQuotes(result);
        setSelectedMethod(result[0]?.method ?? null);
      })
      .catch(() => {
        if (!cancelled) setQuotes([]);
      })
      .finally(() => {
        if (!cancelled) setQuotesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [effectiveAddressId]);

  const selectedQuote = useMemo(
    () => quotes?.find((q) => q.method === selectedMethod) ?? null,
    [quotes, selectedMethod],
  );
  const shippingFee = selectedQuote?.fee ?? 0;
  const total = subtotal + shippingFee;

  if (!hydrated) {
    return (
      <div className="mx-auto max-w-5xl px-4 pt-8 sm:px-6 lg:px-8 pb-16">
        <SkeletonText className="h-7 w-32 mb-8" />
        <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
          <SkeletonBlock className="h-64 w-full" />
          <SkeletonBlock className="h-48 w-full" />
        </div>
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 flex flex-col items-center text-center">
        <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="var(--clr-border-strong)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
          <line x1="3" y1="6" x2="21" y2="6" />
          <path d="M16 10a4 4 0 0 1-8 0" />
        </svg>
        <h1 className="font-display text-2xl font-semibold mt-6">Your cart is empty</h1>
        <p className="mt-2 text-sm max-w-xs" style={{ color: 'var(--clr-text-secondary)' }}>You cannot checkout with an empty cart.</p>
        <Link href="/shop" className="mt-6 btn btn-accent">Browse products</Link>
      </div>
    );
  }

  const newAddressComplete =
    !!newAddress.line1.trim() &&
    !!newAddress.city.trim() &&
    !!newAddress.state.trim() &&
    !!newAddress.postalCode.trim() &&
    !!newAddress.country.trim();

  async function onSaveAddress() {
    if (!newAddressComplete) return;
    setError(null);
    setSavingAddress(true);
    try {
      const created = await createServerAddress({
        label: newAddress.label.trim() || undefined,
        line1: newAddress.line1.trim(),
        line2: newAddress.line2.trim() || undefined,
        city: newAddress.city.trim(),
        state: newAddress.state.trim(),
        postalCode: newAddress.postalCode.trim(),
        country: newAddress.country.trim(),
        isDefault: !addresses || addresses.length === 0,
      });
      setSelectedAddressId(created.id);
      setAddingNew(false);
      setNewAddress(EMPTY_ADDRESS);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that address. Please try again.");
    } finally {
      setSavingAddress(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!effectiveAddressId || !selectedMethod) return;
    setError(null);
    setPlacing(true);
    try {
      const order = await placeServerOrder(effectiveAddressId, selectedMethod as "STANDARD" | "EXPRESS");
      router.push(`/orders/${order.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't place your order. Please try again.");
      setPlacing(false);
    }
  }

  const canSubmit = !showAddForm && !!effectiveAddressId && !!selectedMethod && !placing;

  return (
    <div className="mx-auto max-w-5xl px-4 pt-8 sm:px-6 lg:px-8 pb-16">
      <div className="flex items-center gap-2 text-xs font-semibold mb-8">
        <span className="badge badge-success">1 Cart</span>
        <span style={{ color: 'var(--clr-border-strong)' }}>›</span>
        <span className="badge badge-accent">2 Shipping</span>
        <span style={{ color: 'var(--clr-border-strong)' }}>›</span>
        <span className="text-[var(--clr-text-disabled)]">3 Payment</span>
      </div>

      <h1 className="font-display text-2xl font-semibold">Checkout</h1>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
        <form onSubmit={onSubmit} className="space-y-6">
          <div>
            <h2 className="block text-sm font-semibold mb-3" style={{ color: 'var(--clr-text-primary)' }}>Shipping address</h2>

            {addressesStatus === "loading" && !addresses && <SkeletonBlock className="h-20 w-full" />}

            {addresses && addresses.length > 0 && (
              <div className="space-y-2.5">
                {addresses.map((a) => (
                  <AddressCard
                    key={a.id}
                    address={a}
                    selected={!showAddForm && effectiveAddressId === a.id}
                    onSelect={() => {
                      setAddingNew(false);
                      setSelectedAddressId(a.id);
                    }}
                  />
                ))}
                {!showAddForm && (
                  <button
                    type="button"
                    onClick={() => setAddingNew(true)}
                    className="text-sm font-medium transition-colors"
                    style={{ color: "var(--clr-accent)" }}
                  >
                    + Use a new address
                  </button>
                )}
              </div>
            )}

            {showAddForm && (
              <div className="mt-3 rounded-2xl border border-[var(--clr-border)] p-4">
                <AddressForm value={newAddress} onChange={setNewAddress} />
                <div className="mt-3 flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => void onSaveAddress()}
                    disabled={!newAddressComplete || savingAddress}
                    className="btn btn-accent px-5 py-2 text-sm disabled:opacity-50"
                  >
                    {savingAddress ? "Saving…" : "Save address"}
                  </button>
                  {addresses && addresses.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setAddingNew(false)}
                      className="text-sm font-medium transition-colors"
                      style={{ color: "var(--clr-accent)" }}
                    >
                      ← Use a saved address instead
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          <div>
            <h2 className="block text-sm font-semibold mb-2" style={{ color: 'var(--clr-text-primary)' }}>Shipping method</h2>
            {quotesLoading && <SkeletonBlock className="h-14 w-full" />}
            {!quotesLoading && quotes && quotes.length > 0 && (
              <div className="space-y-2.5">
                {quotes.map((q) => (
                  <label
                    key={q.method}
                    className={`flex items-center justify-between gap-3 rounded-2xl border p-4 cursor-pointer transition-colors ${
                      selectedMethod === q.method ? "border-[var(--clr-accent)] bg-[var(--clr-surface-2)]" : "border-[var(--clr-border)] hover:border-[var(--clr-border-strong)]"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="shipping-method"
                        checked={selectedMethod === q.method}
                        onChange={() => setSelectedMethod(q.method)}
                        className="accent-[var(--clr-accent)]"
                      />
                      <div>
                        <p className="text-sm font-semibold" style={{ color: "var(--clr-text-primary)" }}>{q.label}</p>
                        <p className="text-xs" style={{ color: "var(--clr-text-secondary)" }}>
                          {q.estimatedDaysMin}–{q.estimatedDaysMax} days
                        </p>
                      </div>
                    </div>
                    <span className="text-sm font-bold shrink-0">{q.fee === 0 ? "Free" : formatPrice(q.fee)}</span>
                  </label>
                ))}
              </div>
            )}
            {!quotesLoading && !effectiveAddressId && !showAddForm && (
              <p className="text-sm" style={{ color: "var(--clr-text-secondary)" }}>Select an address to see shipping options.</p>
            )}
          </div>

          <div>
            <h2 className="block text-sm font-semibold mb-2" style={{ color: 'var(--clr-text-primary)' }}>Payment method</h2>
            <div className="rounded-2xl border border-[var(--clr-border)] bg-[var(--clr-surface-2)] p-4 flex gap-3 items-start">
              <svg className="shrink-0 mt-0.5" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--clr-text-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
              <div>
                <p className="text-sm font-semibold text-[var(--clr-text-primary)]">Simulated payment</p>
                <p className="text-xs text-[var(--clr-text-secondary)] mt-1">
                  This places a real order against the store&apos;s backend, but payment settlement itself is simulated — no card details are collected and no real charge occurs.
                </p>
              </div>
            </div>
          </div>

          {error && (
            <p role="alert" className="text-sm" style={{ color: "var(--clr-error, #dc2626)" }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className={`w-full py-3.5 text-sm rounded-2xl font-bold flex justify-center items-center gap-2 ${!canSubmit ? 'bg-[var(--clr-accent-hover)] text-white opacity-60 cursor-not-allowed' : 'btn btn-accent'}`}
          >
            {placing ? (
              <>
                <div className="animate-spin border-2 border-white/30 border-t-white rounded-full w-4 h-4"></div>
                Placing order…
              </>
            ) : (
              `Place order — ${formatPrice(total)}`
            )}
          </button>
        </form>

        <div className="h-fit sticky top-24 rounded-2xl border border-[var(--clr-border)] bg-[var(--clr-surface)] p-6 shadow-card">
          <h2 className="font-display text-lg font-semibold mb-4">Order Summary</h2>
          <div className="space-y-3">
            {lines.map((l) => (
              <div key={l.id} className="flex justify-between text-sm text-[var(--clr-text-secondary)]">
                <span className="line-clamp-2 pr-2">
                  {l.productName} <span className="font-semibold">× {l.quantity}</span>
                </span>
                <span className="shrink-0 font-medium">{formatPrice(l.lineTotal)}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-[var(--clr-border)] space-y-2 text-sm">
            <div className="flex justify-between" style={{ color: "var(--clr-text-secondary)" }}>
              <span>Subtotal</span>
              <span>{formatPrice(subtotal)}</span>
            </div>
            <div className="flex justify-between" style={{ color: "var(--clr-text-secondary)" }}>
              <span>Shipping</span>
              <span>{selectedQuote ? (shippingFee === 0 ? "Free" : formatPrice(shippingFee)) : "—"}</span>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-[var(--clr-border)] flex justify-between items-center text-xl font-bold">
            <span>Total</span>
            <span>{formatPrice(total)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
