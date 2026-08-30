"use client";

import Link from "next/link";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="mx-auto flex max-w-3xl flex-col px-4 py-20 sm:px-6 lg:px-8">
      <p className="text-sm font-semibold uppercase tracking-widest text-[var(--clr-accent)]">
        Something went wrong
      </p>
      <h1 className="mt-3 font-display text-4xl font-semibold text-[var(--clr-text-primary)]">
        We couldn&apos;t load this Veloura page
      </h1>
      <p className="mt-4 max-w-xl leading-relaxed text-[var(--clr-text-secondary)]">
        Try loading it again, or return to the catalog to keep shopping.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <button type="button" onClick={reset} className="btn btn-accent">
          Try again
        </button>
        <Link href="/shop" className="btn">
          Shop catalog
        </Link>
      </div>
    </section>
  );
}
