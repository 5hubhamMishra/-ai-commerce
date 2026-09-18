"use client";

import Link from "next/link";
import { useState } from "react";
import { authApi } from "@ai-commerce/api-client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setResetToken(null);
    setSubmitting(true);
    try {
      const result = await authApi.requestPasswordReset(email);
      setMessage(result.message);
      if (result.resetToken) setResetToken(result.resetToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Password recovery is temporarily unavailable.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-[calc(100vh-64px)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="font-display text-2xl font-semibold" style={{ color: "var(--clr-text-primary)" }}>
            Reset your password
          </h1>
          <p className="mt-1.5 text-sm" style={{ color: "var(--clr-text-secondary)" }}>
            Enter your account email to request a recovery link.
          </p>
        </div>
        <div className="rounded-2xl border p-7" style={{ background: "var(--clr-surface)", borderColor: "var(--clr-border)", boxShadow: "var(--shadow-card)" }}>
          <form onSubmit={onSubmit} className="space-y-5">
            <div>
              <label htmlFor="reset-email" className="block text-sm font-semibold mb-1.5" style={{ color: "var(--clr-text-primary)" }}>
                Email address
              </label>
              <input id="reset-email" type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="input" placeholder="you@example.com" />
            </div>
            {message && <p role="status" className="text-sm" style={{ color: "var(--clr-success, #15803d)" }}>{message}</p>}
            {resetToken && (
              <p className="text-xs" style={{ color: "var(--clr-text-secondary)" }}>
                Local development link: <Link className="underline" href={`/reset-password?token=${encodeURIComponent(resetToken)}`}>continue to reset</Link>
              </p>
            )}
            {error && <p role="alert" className="text-sm" style={{ color: "var(--clr-error, #dc2626)" }}>{error}</p>}
            <button type="submit" disabled={submitting} className="w-full btn btn-accent py-3 text-sm disabled:opacity-60">
              {submitting ? "Requesting link…" : "Request recovery link"}
            </button>
          </form>
        </div>
        <p className="mt-5 text-center text-sm" style={{ color: "var(--clr-text-secondary)" }}>
          <Link href="/login" className="font-semibold" style={{ color: "var(--clr-accent)" }}>Back to sign in</Link>
        </p>
      </div>
    </main>
  );
}
