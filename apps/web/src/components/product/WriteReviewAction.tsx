"use client";

import { useState } from "react";
import Link from "next/link";
import { reviewsApi } from "@ai-commerce/api-client";
import StarRating from "@/components/StarRating";

type Stage = "collapsed" | "form" | "submitting" | "done";

export default function WriteReviewAction({
  orderId,
  productSlug,
  productName,
}: {
  orderId: string;
  productSlug: string;
  productName: string;
}) {
  const [stage, setStage] = useState<Stage>("collapsed");
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (rating < 1) {
      setError("Choose a star rating first.");
      return;
    }
    setError(null);
    setStage("submitting");
    try {
      await reviewsApi.create(productSlug, {
        orderId,
        rating,
        title: title.trim() || undefined,
        body: body.trim() || undefined,
      });
      setStage("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't submit your review. Please try again.");
      setStage("form");
    }
  }

  if (stage === "done") {
    return (
      <p className="text-xs font-medium" style={{ color: "var(--clr-success-text)" }}>
        ✓ Thanks for your review
      </p>
    );
  }

  if (stage === "collapsed") {
    return (
      <button
        type="button"
        onClick={() => setStage("form")}
        className="text-xs font-medium transition-colors"
        style={{ color: "var(--clr-accent)" }}
      >
        Write a review
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => void onSubmit(e)}
      className="mt-3 w-full rounded-xl border p-3.5 space-y-2.5"
      style={{ borderColor: "var(--clr-border)", background: "var(--clr-surface)" }}
    >
      <p className="text-xs font-semibold" style={{ color: "var(--clr-text-primary)" }}>
        Review {productName}
      </p>
      <StarRating value={rating} onChange={setRating} size={20} label="Your rating" />
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={120}
        placeholder="Title (optional)"
        className="w-full rounded-lg border px-3 py-1.5 text-sm outline-none focus:border-[var(--clr-accent)]"
        style={{ borderColor: "var(--clr-border)" }}
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={2000}
        rows={3}
        placeholder="Share your thoughts (optional)"
        className="w-full rounded-lg border px-3 py-1.5 text-sm outline-none focus:border-[var(--clr-accent)] resize-none"
        style={{ borderColor: "var(--clr-border)" }}
      />
      {error && (
        <p role="alert" className="text-xs" style={{ color: "var(--clr-error, #dc2626)" }}>
          {error}
        </p>
      )}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={stage === "submitting"}
          className="btn btn-accent px-4 py-1.5 text-xs disabled:opacity-60"
        >
          {stage === "submitting" ? "Submitting…" : "Submit review"}
        </button>
        <button
          type="button"
          onClick={() => setStage("collapsed")}
          className="text-xs font-medium"
          style={{ color: "var(--clr-text-secondary)" }}
        >
          Cancel
        </button>
        <Link
          href={`/products/${productSlug}`}
          className="ml-auto text-xs font-medium"
          style={{ color: "var(--clr-accent)" }}
        >
          View product
        </Link>
      </div>
    </form>
  );
}
