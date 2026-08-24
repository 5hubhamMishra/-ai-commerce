"use client";

/** Read-only by default (product cards, review list). Pass `onChange` to make it an input
 *  (the review form) — same visual, just clickable stars and a bigger hit target. */
export default function StarRating({
  value,
  size = 14,
  onChange,
  label,
}: {
  value: number;
  size?: number;
  onChange?: (next: number) => void;
  label?: string;
}) {
  const interactive = !!onChange;
  const rounded = Math.round(value);

  return (
    <div
      className="inline-flex items-center gap-0.5"
      role={interactive ? "radiogroup" : "img"}
      aria-label={label ?? `${value.toFixed(1)} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= rounded;
        const StarEl = interactive ? "button" : "span";
        return (
          <StarEl
            key={star}
            type={interactive ? "button" : undefined}
            role={interactive ? "radio" : undefined}
            aria-checked={interactive ? star === rounded : undefined}
            aria-label={interactive ? `${star} star${star === 1 ? "" : "s"}` : undefined}
            onClick={interactive ? () => onChange(star) : undefined}
            className={interactive ? "p-0.5 -m-0.5 rounded transition-transform hover:scale-110" : undefined}
          >
            <svg
              width={size}
              height={size}
              viewBox="0 0 24 24"
              fill={filled ? "var(--clr-star)" : "var(--clr-star-empty)"}
              aria-hidden="true"
            >
              <path d="M12 2.5 15 9l7 .9-5.1 4.8 1.4 6.9L12 18l-6.3 3.6 1.4-6.9L2 9.9 9 9z" />
            </svg>
          </StarEl>
        );
      })}
    </div>
  );
}
