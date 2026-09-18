"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { authApi } from "@ai-commerce/api-client";

const MIN_PASSWORD_LENGTH = 8;

function ResetPasswordForm() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(token ? null : "This password reset link is missing its token.");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    if (!token) return setError("This password reset link is missing its token.");
    if (password.length < MIN_PASSWORD_LENGTH) return setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    if (password !== confirmation) return setError("Passwords do not match.");
    setSubmitting(true);
    try {
      const result = await authApi.resetPassword(token, password);
      setMessage(result.message);
      setPassword("");
      setConfirmation("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "This password reset link is invalid or has expired.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-[calc(100vh-64px)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="font-display text-2xl font-semibold" style={{ color: "var(--clr-text-primary)" }}>Choose a new password</h1>
          <p className="mt-1.5 text-sm" style={{ color: "var(--clr-text-secondary)" }}>Use at least eight characters.</p>
        </div>
        <div className="rounded-2xl border p-7" style={{ background: "var(--clr-surface)", borderColor: "var(--clr-border)", boxShadow: "var(--shadow-card)" }}>
          <form onSubmit={onSubmit} className="space-y-5">
            <div>
              <label htmlFor="new-password" className="block text-sm font-semibold mb-1.5" style={{ color: "var(--clr-text-primary)" }}>New password</label>
              <input id="new-password" type="password" required minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="input" />
            </div>
            <div>
              <label htmlFor="confirm-password" className="block text-sm font-semibold mb-1.5" style={{ color: "var(--clr-text-primary)" }}>Confirm password</label>
              <input id="confirm-password" type="password" required minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="input" />
            </div>
            {message && <p role="status" className="text-sm" style={{ color: "var(--clr-success, #15803d)" }}>{message} <Link href="/login" className="font-semibold underline">Sign in</Link></p>}
            {error && <p role="alert" className="text-sm" style={{ color: "var(--clr-error, #dc2626)" }}>{error}</p>}
            <button type="submit" disabled={submitting || Boolean(message)} className="w-full btn btn-accent py-3 text-sm disabled:opacity-60">
              {submitting ? "Updating password…" : "Update password"}
            </button>
          </form>
        </div>
        <p className="mt-5 text-center text-sm" style={{ color: "var(--clr-text-secondary)" }}><Link href="/login" className="font-semibold" style={{ color: "var(--clr-accent)" }}>Back to sign in</Link></p>
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return <Suspense fallback={null}><ResetPasswordForm /></Suspense>;
}
