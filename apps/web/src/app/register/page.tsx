"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useStore } from "@/lib/store";

export default function RegisterPage() {
  const router = useRouter();
  const login = useStore((s) => s.login);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    login(name || "Shopper", email);
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
            Create your account
          </h1>
          <p className="mt-1.5 text-sm" style={{ color: "var(--clr-text-secondary)" }}>
            Demo signup — no email verification required.
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
                htmlFor="reg-name"
                className="block text-sm font-semibold mb-1.5"
                style={{ color: "var(--clr-text-primary)" }}
              >
                Full name
              </label>
              <input
                id="reg-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Alex Sharma"
                className="input"
              />
            </div>

            <div>
              <label
                htmlFor="reg-email"
                className="block text-sm font-semibold mb-1.5"
                style={{ color: "var(--clr-text-primary)" }}
              >
                Email address
              </label>
              <input
                id="reg-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="input"
              />
            </div>

            <div
              className="rounded-xl p-3 text-xs"
              style={{ background: "var(--clr-surface-2)", color: "var(--clr-text-secondary)" }}
            >
              No real account is created. Your session is stored in this browser only.
            </div>

            <button
              type="submit"
              className="w-full btn btn-accent py-3 text-sm"
            >
              Create account
            </button>
          </form>
        </div>

        <p className="mt-5 text-center text-sm" style={{ color: "var(--clr-text-secondary)" }}>
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-semibold transition-colors"
            style={{ color: "var(--clr-accent)" }}
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
