import { useId } from 'react';

export default function RatingStars({ rating, count, size = 'sm' }: { rating: number; count?: number; size?: 'sm' | 'md' }) {
  // useId, not Math.random() — deterministic across server/client render
  // and stable per component instance without needing a memo at all.
  const gradientId = useId();
  const starSize = size === 'sm' ? 12 : 16;
  
  return (
    <div 
      className="flex items-center gap-1"
      aria-label={`${rating.toFixed(1)} out of 5 stars${count !== undefined ? `, ${count} reviews` : ''}`}
    >
      <div className="flex">
        {[0, 1, 2, 3, 4].map((i) => {
          let fillPercent = 0;
          if (rating >= i + 1) fillPercent = 100;
          else if (rating > i) fillPercent = (rating - i) * 100;
          
          const isPartial = fillPercent > 0 && fillPercent < 100;
          
          return (
            <svg 
              key={i}
              width={starSize} 
              height={starSize} 
              viewBox="0 0 24 24" 
              className="flex-shrink-0"
              style={{
                fill: isPartial ? `url(#${gradientId}-${i})` : (fillPercent === 100 ? 'var(--clr-star)' : 'var(--clr-star-empty, var(--clr-text-disabled))')
              }}
            >
              {isPartial && (
                <defs>
                  <linearGradient id={`${gradientId}-${i}`} x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset={`${fillPercent}%`} stopColor="var(--clr-star)" />
                    <stop offset={`${fillPercent}%`} stopColor="var(--clr-star-empty, var(--clr-text-disabled))" />
                  </linearGradient>
                </defs>
              )}
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          );
        })}
      </div>
      <span className="text-xs text-[var(--clr-text-secondary)]">
        {rating.toFixed(1)} {count !== undefined && `(${count})`}
      </span>
    </div>
  );
}
