"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AdminDashboardReport, ListOrdersResponse } from "@ai-commerce/types";
import { analyticsApi, ApiError, eventsApi, ordersApi, recommendationsApi } from "@ai-commerce/api-client";
import { useStore } from "@/lib/store";
import { hasAnyRole, ADMIN_SURFACE_ROLES } from "@/lib/roles";
import { formatPrice } from "@/lib/format";
import { ORDER_STATUS_BADGE, ORDER_STATUS_LABELS } from "@/lib/order-status";
import { SkeletonBlock, SkeletonText } from "@/components/Skeleton";

const ORDERS_PAGE_SIZE = 100;

function accessDeniedMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError && err.status === 403) return "You don't have the role required to view this section.";
  return fallback;
}

export default function AdminPage() {
  const router = useRouter();
  const hydrated = useStore((s) => s.hydrated);
  const authStatus = useStore((s) => s.authStatus);
  const user = useStore((s) => s.user);
  const userId = user?.id;

  const authorized = hasAnyRole(user, ADMIN_SURFACE_ROLES);

  const [dashboard, setDashboard] = useState<AdminDashboardReport | null>(null);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [orders, setOrders] = useState<ListOrdersResponse | null>(null);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [aggregationStatus, setAggregationStatus] = useState<Awaited<ReturnType<typeof eventsApi.getAggregationStatus>> | null>(null);
  const [aggregationError, setAggregationError] = useState<string | null>(null);
  const [reindexing, setReindexing] = useState(false);
  const [reindexMessage, setReindexMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!hydrated) return;
    if (authStatus === "unauthenticated") router.replace("/login?redirect=/admin");
  }, [hydrated, authStatus, router]);

  useEffect(() => {
    if (authStatus !== "authenticated" || !authorized) return;
    let cancelled = false;
    startTransition(() => {
      setDashboard(null);
      setDashboardError(null);
      setOrders(null);
      setOrdersError(null);
      setAggregationStatus(null);
      setAggregationError(null);
      setReindexMessage(null);
    });
    analyticsApi
      .getDashboard()
      .then((report) => {
        if (!cancelled) setDashboard(report);
      })
      .catch((err) => {
        if (!cancelled) setDashboardError(accessDeniedMessage(err, "Couldn't load analytics."));
      });
    ordersApi
      .adminList({ pageSize: ORDERS_PAGE_SIZE })
      .then((result) => {
        if (!cancelled) setOrders(result);
      })
      .catch((err) => {
        if (!cancelled) setOrdersError(accessDeniedMessage(err, "Couldn't load orders."));
      });
    eventsApi
      .getAggregationStatus()
      .then((status) => {
        if (!cancelled) setAggregationStatus(status);
      })
      .catch((err) => {
        if (!cancelled) setAggregationError(accessDeniedMessage(err, "Couldn't load queue status."));
      });
    return () => {
      cancelled = true;
    };
  }, [authStatus, authorized, userId]);

  async function reindexEmbeddings() {
    if (!window.confirm("Reindex embeddings for the full catalog?")) return;
    setReindexing(true);
    setReindexMessage(null);
    try {
      const result = await recommendationsApi.reindexEmbeddings();
      setReindexMessage(`Reindexed ${result.productCount} products.`);
      analyticsApi.getDashboard().then(setDashboard).catch(() => undefined);
    } catch (err) {
      setReindexMessage(accessDeniedMessage(err, "Couldn't reindex embeddings."));
    } finally {
      setReindexing(false);
    }
  }

  const orderStats = useMemo(() => {
    if (!orders) return null;
    const counted = orders.items.filter((o) => o.status !== "CANCELLED");
    const revenue = counted.reduce((sum, o) => sum + o.total, 0);
    return { revenue, count: counted.length, aov: counted.length ? Math.round(revenue / counted.length) : 0 };
  }, [orders]);

  if (!hydrated || authStatus === "idle" || authStatus === "checking") {
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

  if (authStatus === "unauthenticated") return null; // redirecting

  if (!authorized) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="var(--clr-border-strong)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className="mx-auto">
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <h1 className="font-display text-xl font-semibold mt-4" style={{ color: "var(--clr-text-primary)" }}>Not authorized</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--clr-text-secondary)" }}>
          Your account doesn&apos;t hold a role with admin dashboard access.
        </p>
        <Link href="/" className="mt-5 btn btn-accent inline-flex">Back to shop</Link>
      </div>
    );
  }

  return (
    <div className="pb-12">
      <div className="bg-stone-950 text-white w-full">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <h1 className="font-display text-3xl font-semibold text-white">Business Dashboard</h1>
          <p className="mt-1 text-sm text-stone-400">
            Real data from apps/api — signed in as {user?.name} ({user?.roles.join(", ")}).
          </p>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Stat
          label="Purchasable Products"
          value={dashboard ? dashboard.recommendations.catalog.purchasableProducts.toString() : "—"}
          trend="In the live catalog"
        />
        <Stat
          label="Revenue"
          value={orderStats ? formatPrice(orderStats.revenue) : "—"}
          trend={`Last ${ORDERS_PAGE_SIZE} orders, excl. cancelled`}
        />
        <Stat label="Orders" value={orderStats ? orderStats.count.toString() : "—"} trend="Non-cancelled" />
        <Stat label="Avg Order Value" value={orderStats ? formatPrice(orderStats.aov) : "—"} trend="Per order" />
      </div>

      <Section title="Business Insights">
        {dashboardError ? (
          <ErrorNote message={dashboardError} />
        ) : !dashboard ? (
          <SkeletonBlock className="h-24 w-full" />
        ) : dashboard.insights.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--clr-text-secondary)" }}>No insights yet — check back once there&apos;s more activity.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {dashboard.insights.map((ins) => (
              <div key={ins.id} className="rounded-xl bg-white border border-amber-100 px-4 py-3 flex gap-3">
                <span className={`badge shrink-0 ${ins.severity === "critical" ? "badge-error" : ins.severity === "warning" ? "badge-warning" : "badge-subtle"}`}>
                  {ins.severity}
                </span>
                <span className="text-sm leading-relaxed text-stone-700">{ins.message}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <div className="mt-6 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 grid gap-6 lg:grid-cols-2">
        <Card title="Stockout Risk">
          {dashboardError ? (
            <ErrorNote message={dashboardError} />
          ) : !dashboard ? (
            <SkeletonBlock className="h-48 w-full" />
          ) : dashboard.topStockoutRisks.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--clr-text-secondary)" }}>No products currently at risk of stocking out.</p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-[var(--clr-border)]">
              <table className="data-table w-full text-sm text-left">
                <thead className="bg-stone-50 border-b border-[var(--clr-border)] text-xs uppercase text-stone-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Product</th>
                    <th className="px-4 py-3 font-medium text-right">Available</th>
                    <th className="px-4 py-3 font-medium text-right">Days left</th>
                    <th className="px-4 py-3 font-medium">Risk</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--clr-border)]">
                  {dashboard.topStockoutRisks.map((r) => (
                    <tr key={r.variantId}>
                      <td className="px-4 py-3 truncate max-w-[150px]">{r.productName}</td>
                      <td className={`px-4 py-3 text-right font-medium ${r.availableUnits < 5 ? "text-red-600" : r.availableUnits < 15 ? "text-amber-600" : "text-emerald-600"}`}>
                        {r.availableUnits}
                      </td>
                      <td className="px-4 py-3 text-right">{r.daysUntilStockout ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`badge ${r.riskLevel === "critical" ? "badge-error" : "badge-warning"}`}>{r.riskLevel}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Customer Segmentation">
          {dashboardError ? (
            <ErrorNote message={dashboardError} />
          ) : !dashboard ? (
            <SkeletonBlock className="h-48 w-full" />
          ) : dashboard.segmentation.totalProfiles === 0 ? (
            <p className="text-sm" style={{ color: "var(--clr-text-secondary)" }}>No customer profiles yet.</p>
          ) : (
            <>
              <p className="text-xs mb-3" style={{ color: "var(--clr-text-secondary)" }}>{dashboard.segmentation.totalProfiles} profiles</p>
              <BarList items={dashboard.segmentation.bySegment.map((s) => ({ label: s.segment, share: s.share, count: s.count }))} />
              <p className="text-xs mt-5 mb-2 font-semibold uppercase tracking-widest" style={{ color: "var(--clr-text-disabled)" }}>Lifecycle stage</p>
              <BarList items={dashboard.segmentation.byLifecycleStage.map((s) => ({ label: s.stage, share: s.share, count: s.count }))} />
            </>
          )}
        </Card>
      </div>

      <div className="mt-6 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 grid gap-6 lg:grid-cols-3">
        <Card title="Recommendations">
          {dashboardError ? <ErrorNote message={dashboardError} /> : !dashboard ? <SkeletonBlock className="h-32 w-full" /> : (
            <div className="space-y-4">
              <dl className="space-y-2 text-sm">
                <Metric label="Product coverage" value={`${Math.round(dashboard.recommendations.coverage.productCoverage * 100)}%`} />
                <Metric label="Click-through rate" value={dashboard.recommendations.engagement.clickThroughRate == null ? "No data" : `${Math.round(dashboard.recommendations.engagement.clickThroughRate * 100)}%`} />
                <Metric label="Conversion rate" value={dashboard.recommendations.engagement.conversionRate == null ? "No data" : `${Math.round(dashboard.recommendations.engagement.conversionRate * 100)}%`} />
                <Metric label={`Hit rate @${dashboard.recommendations.offlineBacktest.k}`} value={dashboard.recommendations.offlineBacktest.hitRateAtK == null ? "No data" : `${Math.round(dashboard.recommendations.offlineBacktest.hitRateAtK * 100)}%`} />
              </dl>
              <div className="border-t border-[var(--clr-border)] pt-4">
                <button type="button" className="btn btn-accent text-sm" onClick={reindexEmbeddings} disabled={reindexing} aria-busy={reindexing}>
                  {reindexing ? "Reindexing..." : "Reindex embeddings"}
                </button>
                {reindexMessage && <p className="mt-2 text-xs" style={{ color: "var(--clr-text-secondary)" }}>{reindexMessage}</p>}
              </div>
            </div>
          )}
        </Card>

        <Card title="Search">
          {dashboardError ? <ErrorNote message={dashboardError} /> : !dashboard ? <SkeletonBlock className="h-32 w-full" /> : (
            <dl className="space-y-2 text-sm">
              <Metric label={`Searches (${dashboard.search.windowDays}d)`} value={dashboard.search.totalSearches.toString()} />
              <Metric label="Zero-result rate" value={`${Math.round(dashboard.search.zeroResultRate * 100)}%`} />
              <Metric label="Vector search usage" value={`${Math.round(dashboard.search.semanticUsageRate * 100)}%`} />
              {dashboard.search.topQueries[0] && <Metric label="Top query" value={`"${dashboard.search.topQueries[0].query}"`} />}
            </dl>
          )}
        </Card>

        <Card title="ShopAI">
          {dashboardError ? <ErrorNote message={dashboardError} /> : !dashboard ? <SkeletonBlock className="h-32 w-full" /> : (
            <dl className="space-y-2 text-sm">
              <Metric label={`Interactions (${dashboard.shopai.windowDays}d)`} value={dashboard.shopai.totalInteractions.toString()} />
              <Metric label="Refusal rate" value={`${Math.round(dashboard.shopai.refusalRate * 100)}%`} />
              <Metric label="Avg latency" value={`${Math.round(dashboard.shopai.avgLatencyMs)} ms`} />
              {dashboard.shopai.topTools[0] && <Metric label="Top tool" value={dashboard.shopai.topTools[0].name} />}
            </dl>
          )}
        </Card>

        <Card title="Personalization Queue">
          {aggregationError ? <ErrorNote message={aggregationError} /> : !aggregationStatus ? <SkeletonBlock className="h-32 w-full" /> : (
            <dl className="space-y-2 text-sm">
              <Metric label="Waiting events" value={aggregationStatus.unprocessedEvents.toString()} />
              <Metric label="Oldest wait" value={formatAge(aggregationStatus.oldestUnprocessedAgeMs)} />
            </dl>
          )}
        </Card>
      </div>

      <div className="mt-6 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Card title="Recent Orders">
          {ordersError ? (
            <ErrorNote message={ordersError} />
          ) : !orders ? (
            <SkeletonBlock className="h-48 w-full" />
          ) : orders.items.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--clr-text-secondary)" }}>No orders yet.</p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-[var(--clr-border)]">
              <table className="data-table w-full text-sm text-left">
                <thead className="bg-stone-50 border-b border-[var(--clr-border)] text-xs uppercase text-stone-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Order</th>
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium text-right">Items</th>
                    <th className="px-4 py-3 font-medium text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--clr-border)]">
                  {orders.items.map((o) => (
                    <tr
                      key={o.id}
                      tabIndex={0}
                      aria-label={`Open order ${o.id.slice(0, 8)}`}
                      className="hover:bg-stone-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--clr-accent)] cursor-pointer"
                      onClick={() => router.push(`/admin/orders/${o.id}`)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          router.push(`/admin/orders/${o.id}`);
                        }
                      }}
                    >
                      <td className="px-4 py-3 font-mono text-xs">{o.id.slice(0, 8)}</td>
                      <td className="px-4 py-3">{new Date(o.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</td>
                      <td className="px-4 py-3">
                        <span className={`badge badge-${ORDER_STATUS_BADGE[o.status]}`}>{ORDER_STATUS_LABELS[o.status]}</span>
                      </td>
                      <td className="px-4 py-3 text-right">{o.itemCount}</td>
                      <td className="px-4 py-3 text-right font-semibold">{formatPrice(o.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
        <h2 className="font-display text-lg font-semibold mb-4">{title}</h2>
        {children}
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[var(--clr-border)] bg-[var(--clr-surface)] p-6">
      <h2 className="font-display text-lg font-semibold mb-4">{title}</h2>
      {children}
    </div>
  );
}

function ErrorNote({ message }: { message: string }) {
  return <p className="text-sm" style={{ color: "var(--clr-error, #dc2626)" }}>{message}</p>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt style={{ color: "var(--clr-text-secondary)" }}>{label}</dt>
      <dd className="font-semibold" style={{ color: "var(--clr-text-primary)" }}>{value}</dd>
    </div>
  );
}

function formatAge(ageMs: number | null): string {
  if (ageMs === null) return "Clear";
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hr${hours === 1 ? "" : "s"}`;
}

function BarList({ items }: { items: { label: string; share: number; count: number }[] }) {
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.label}>
          <div className="flex justify-between text-sm mb-0.5">
            <span className="font-medium capitalize">{item.label.replaceAll("_", " ")}</span>
            <span style={{ color: "var(--clr-text-secondary)" }}>{item.count} ({Math.round(item.share * 100)}%)</span>
          </div>
          <div className="h-1 rounded-full bg-stone-100 overflow-hidden w-full">
            <div className="h-1 rounded-full bg-amber-400" style={{ width: `${Math.round(item.share * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Stat({ label, value, trend }: { label: string; value: string; trend: string }) {
  return (
    <div className="rounded-2xl border border-[var(--clr-border)] bg-[var(--clr-surface)] p-5 flex flex-col gap-2 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-widest text-[var(--clr-text-disabled)]">{label}</div>
      <div className="text-3xl font-bold font-display" style={{ color: "var(--clr-text-primary)" }}>{value}</div>
      <div className="text-xs font-medium" style={{ color: "var(--clr-text-secondary)" }}>{trend}</div>
    </div>
  );
}
