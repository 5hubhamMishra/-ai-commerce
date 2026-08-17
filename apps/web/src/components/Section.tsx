import { ReactNode } from 'react';
import Link from 'next/link';

export default function Section({ 
  title, 
  subtitle, 
  href, 
  children, 
  variant = 'grid' 
}: { 
  title: string; 
  subtitle?: string; 
  href?: string; 
  children: ReactNode; 
  variant?: 'grid' | 'scroll' 
}) {
  return (
    <section className="py-10 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      <div className="flex items-end justify-between mb-6">
        <div className="flex gap-3">
          <div className="w-1 h-6 rounded-full bg-amber-700 mt-1 flex-shrink-0" />
          <div>
            <h2 className="font-display text-2xl font-semibold text-[var(--clr-text-primary)]">
              {title}
            </h2>
            {subtitle && (
              <p className="text-sm mt-0.5 text-[var(--clr-text-secondary)]">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {href && (
          <Link 
            href={href}
            className="text-xs font-semibold px-3 py-1.5 rounded-full border border-[var(--clr-border)] text-[var(--clr-text-secondary)] hover:border-[var(--clr-accent)] hover:text-[var(--clr-accent)] transition-all duration-200"
          >
            View all
          </Link>
        )}
      </div>
      
      {variant === 'scroll' ? (
        <div className="scroll-row">
          {children}
        </div>
      ) : (
        children
      )}
    </section>
  );
}
