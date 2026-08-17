"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useStore } from "@/lib/store";

export default function LoginPage() {
  const router = useRouter();
  const login = useStore((s) => s.login);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const name = email.split("@")[0] || "Shopper";
    login(name.charAt(0).toUpperCase() + name.slice(1), email);
    router.push("/");
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
            Demo authentication — any email and password work.
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
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Any password works in demo"
                className="input"
              />
            </div>

            <button
              type="submit"
              className="w-full btn btn-accent py-3 text-sm"
              style={{ marginTop: "0.5rem" }}
            >
              Sign in to Veloura
            </button>
          </form>

          <div
            className="mt-5 rounded-xl p-3 text-xs text-center"
            style={{ background: "var(--clr-accent-subtle)", color: "var(--clr-accent-text)" }}
          >
            This is a demo storefront. Any credentials are accepted.
          </div>
        </div>

        <p className="mt-5 text-center text-sm" style={{ color: "var(--clr-text-secondary)" }}>
          New here?{" "}
          <Link
            href="/register"
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
