"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { safeRedirectPath } from "@/lib/safeRedirect";
import AccountTypeSelector from "@/components/AccountTypeSelector";
import { isSeller, syncSellerSession } from "@/lib/seller-session";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const login = useStore((s) => s.login);
  const [seller, setSeller] = useState(params.get('mode') === 'seller');
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      const { user, accessToken } = useStore.getState();
      if (isSeller(user) && accessToken) {
        await syncSellerSession(accessToken);
        router.push('/seller');
        return;
      }
      if (seller && !user?.roles.some((r) => r === 'ADMIN' || r === 'SUPER_ADMIN')) {
        setError('This account is registered as a customer. Continue shopping or open a shop.');
        return;
      }
      router.push(safeRedirectPath(params.get("redirect")));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        {/* Logo mark */}
        <div className="text-center mb-8">
          <div
            className="inline-flex h-12 w-12 items-center justify-center rounded-2xl mb-4"
            style={{ background: "var(--clr-ink)" }}
          >
            <span className="font-display text-lg font-bold text-white">V</span>
          </div>
          <h1 className="font-display text-2xl font-semibold" style={{ color: "var(--clr-text-primary)" }}>
            Welcome back
          </h1>
          <p className="mt-1.5 text-sm" style={{ color: "var(--clr-text-secondary)" }}>
            Sign in to your Veloura account.
          </p>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl border p-7"
          style={{
            background: "var(--clr-surface)",
            borderColor: "var(--clr-border)",
            boxShadow: "var(--shadow-card)",
          }}
        >
          <form onSubmit={onSubmit} className="space-y-5">
            <AccountTypeSelector seller={seller} onChange={setSeller} />
            <div>
              <label
                htmlFor="login-email"
                className="block text-sm font-semibold mb-1.5"
                style={{ color: "var(--clr-text-primary)" }}
              >
                Email address
              </label>
              <input
                id="login-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="input"
              />
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="block text-sm font-semibold mb-1.5"
                style={{ color: "var(--clr-text-primary)" }}
              >
                Password
              </label>
              <input
                id="login-password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="input"
              />
            </div>

            <div className="-mt-2 text-right">
              <Link href="/forgot-password" className="text-sm font-semibold" style={{ color: "var(--clr-accent)" }}>
                Forgot your password?
              </Link>
            </div>

            {error && (
              <p role="alert" className="text-sm" style={{ color: "var(--clr-error, #dc2626)" }}>
                {error}
                {error.startsWith('This account') && <span className="mt-2 flex gap-4"><Link href="/">Continue shopping</Link><Link href="/sell">Open a shop</Link></span>}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full btn btn-accent py-3 text-sm disabled:opacity-60"
              style={{ marginTop: "0.5rem" }}
            >
              {submitting ? "Signing in…" : seller ? "Sign in to Seller Center" : "Sign in to Veloura"}
            </button>
          </form>
        </div>

        <p className="mt-5 text-center text-sm" style={{ color: "var(--clr-text-secondary)" }}>
          New here?{" "}
          <Link
            href={seller ? '/register?mode=seller' : '/register'}
            className="font-semibold transition-colors"
            style={{ color: "var(--clr-accent)" }}
          >
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
