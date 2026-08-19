"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import { useStore } from "@/lib/store";
import { forecastDemand, categoryPerformance, topProducts, lowPerformers, orderMetrics, generateInsights } from "@/lib/admin";
import { formatPrice } from "@/lib/format";
import { products } from "@/lib/data";
import { SkeletonBlock, SkeletonText } from "@/components/Skeleton";

// recharts is a moderately large charting library needed only by this one
// admin panel — dynamically imported so it never loads until this section
// is actually rendered, not bundled into every visitor's route chunk.
const CategoryPerformanceChart = dynamic(
  () => import("@/components/admin/CategoryPerformanceChart"),
  {
    ssr: false,
    loading: () => (
      <div className="h-[240px] rounded-xl skeleton" aria-hidden="true" />
    ),
  },
);

export default function AdminPage() {
  const orders = useStore((s) => s.orders);
  const hydrated = useStore((s) => s.hydrated);

  const risks = useMemo(() => forecastDemand(6), []);
  const catPerf = useMemo(() => categoryPerformance(), []);
  const top = useMemo(() => topProducts(6), []);
  const low = useMemo(() => lowPerformers(6), []);
  const metrics = useMemo(() => orderMetrics(orders), [orders]);
  const insights = useMemo(() => generateInsights(orders), [orders]);

  if (!hydrated) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <SkeletonText className="h-8 w-64 mb-8" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonBlock key={i} className="h-24 w-full" />
          ))}
        </div>
        <SkeletonBlock className="h-64 w-full mt-6" />
      </div>
    );
  }

  return (
    <div className="pb-12">
      <div className="bg-stone-950 text-white w-full">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <h1 className="font-display text-3xl font-semibold text-white">Business Dashboard</h1>
          <p className="mt-1 text-sm text-stone-400">Catalog metrics from seeded data; order metrics reflect this browser session.</p>
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 text-xs text-amber-400">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            Demo build — this page has no real access control. It isn&apos;t linked from the storefront and is excluded from search indexing.
          </p>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Stat 
          label="Products" 
          value={products.length.toString()} 
          trend={`${products.length} in catalog`}
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7"></rect>
              <rect x="14" y="3" width="7" height="7"></rect>
              <rect x="14" y="14" width="7" height="7"></rect>
              <rect x="3" y="14" width="7" height="7"></rect>
            </svg>
          }
        />
        <Stat 
          label="Session Revenue" 
          value={formatPrice(metrics.revenue)} 
          trend={`${metrics.orderCount} orders placed`}
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"></path>
              <path d="M12 18V6"></path>
            </svg>
          }
        />
        <Stat 
          label="Orders" 
          value={metrics.orderCount.toString()} 
          trend="This browser session"
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <path d="M16 10a4 4 0 0 1-8 0"></path>
            </svg>
          }
        />
        <Stat 
          label="Avg Order Value" 
          value={formatPrice(metrics.aov)} 
          trend="Per completed order"
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="20" x2="18" y2="10"></line>
              <line x1="12" y1="20" x2="12" y2="4"></line>
              <line x1="6" y1="20" x2="6" y2="14"></line>
            </svg>
          }
        />
      </div>

      <div className="mt-6 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <div className="flex items-center gap-2">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="9" y1="18" x2="15" y2="18"></line>
              <line x1="10" y1="22" x2="14" y2="22"></line>
              <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"></path>
            </svg>
            <h2 className="font-display text-lg font-semibold">Business Insights</h2>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {insights.map((ins, i) => (
              <div key={i} className="rounded-xl bg-white border border-amber-100 px-4 py-3 flex gap-3">
                <span className="shrink-0 mt-0.5">{iconFor(ins.icon)}</span>
                <span className="text-sm leading-relaxed text-stone-700">{ins.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-[var(--clr-border)] bg-[var(--clr-surface)] p-6">
          <h2 className="font-display text-lg font-semibold mb-4">Category Performance</h2>
          <CategoryPerformanceChart data={catPerf} />
          <div className="grid grid-cols-2 gap-1.5 mt-4">
            {catPerf.map(c => (
              <div key={c.name} className="flex items-center justify-between text-xs">
                <span className="text-stone-600 font-medium truncate pr-2">{c.name}</span>
                <span className="text-stone-400 shrink-0">{c.productCount} items · {c.avgRating}★</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--clr-border)] bg-[var(--clr-surface)] p-6">
          <h2 className="font-display text-lg font-semibold mb-4">Stockout Risk</h2>
          <div className="overflow-hidden rounded-xl border border-[var(--clr-border)]">
            <table className="data-table w-full text-sm text-left">
              <thead className="bg-stone-50 border-b border-[var(--clr-border)] text-xs uppercase text-stone-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Product</th>
                  <th className="px-4 py-3 font-medium text-right">Stock</th>
                  <th className="px-4 py-3 font-medium text-right">7d Demand</th>
                  <th className="px-4 py-3 font-medium">Risk</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--clr-border)]">
                {risks.map((r) => (
                  <tr key={r.productId}>
                    <td className="px-4 py-3 truncate max-w-[150px]">{r.name}</td>
                    <td className={`px-4 py-3 text-right font-medium ${r.stock < 5 ? 'text-red-600' : r.stock < 15 ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {r.stock}
                    </td>
                    <td className="px-4 py-3 text-right">{r.predicted7DayDemand}</td>
                    <td className="px-4 py-3">
                      <span className={`badge ${r.risk === "HIGH" ? "badge-error" : "badge-warning"}`}>
                        {r.risk}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="mt-6 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 grid gap-6 lg:grid-cols-2 pb-12">
        <div className="rounded-2xl border border-[var(--clr-border)] bg-[var(--clr-surface)] p-6">
          <h2 className="font-display text-lg font-semibold mb-4">Top Products</h2>
          <ul className="space-y-4">
            {top.map((p, i) => (
              <li key={p.id} className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-amber-50 flex items-center justify-center text-xs font-bold text-amber-700 shrink-0">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-medium truncate">{p.name}</span>
                    <span className="text-xs font-medium text-stone-500 shrink-0 ml-2">{p.rating}★</span>
                  </div>
                  <div className="h-1 rounded-full bg-stone-100 w-full overflow-hidden">
                    <div className="bg-amber-400 h-1 rounded-full" style={{ width: `${(p.rating / 5) * 100}%` }}></div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
        
        <div className="rounded-2xl border border-[var(--clr-border)] bg-[var(--clr-surface)] p-6">
          <h2 className="font-display text-lg font-semibold mb-4">Needs Attention</h2>
          <ul className="space-y-4">
            {low.map((p, i) => (
              <li key={p.id} className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-red-50 flex items-center justify-center text-xs font-bold text-red-600 shrink-0">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-medium truncate">{p.name}</span>
                    <span className="text-xs font-medium text-stone-500 shrink-0 ml-2">{p.rating}★</span>
                  </div>
                  <div className="h-1 rounded-full bg-stone-100 w-full overflow-hidden">
                    <div className="bg-amber-400 h-1 rounded-full" style={{ width: `${(p.rating / 5) * 100}%` }}></div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, trend, icon }: { label: string; value: string; trend: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[var(--clr-border)] bg-[var(--clr-surface)] p-5 flex flex-col gap-2 shadow-sm">
      <div className="flex items-center gap-2">
        <div className="text-stone-400">{icon}</div>
        <div className="text-xs font-semibold uppercase tracking-widest text-[var(--clr-text-disabled)]">{label}</div>
      </div>
      <div className="text-3xl font-bold font-display" style={{ color: 'var(--clr-text-primary)' }}>{value}</div>
      <div className="flex items-center gap-1 text-xs font-medium text-[var(--clr-success)]">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 19V5M5 12l7-7 7 7"/>
        </svg>
        {trend}
      </div>
    </div>
  );
}

function iconFor(icon: string) {
  switch (icon) {
    case "warning":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--clr-warning)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
          <line x1="12" y1="9" x2="12" y2="13"></line>
          <line x1="12" y1="17" x2="12.01" y2="17"></line>
        </svg>
      );
    case "trend":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--clr-success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline>
          <polyline points="17 6 23 6 23 12"></polyline>
        </svg>
      );
    case "star":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--clr-warning)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
        </svg>
      );
    default:
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--clr-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="16" x2="12" y2="12"></line>
          <line x1="12" y1="8" x2="12.01" y2="8"></line>
        </svg>
      );
  }
}
