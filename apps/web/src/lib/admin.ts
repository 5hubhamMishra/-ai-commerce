import { products, categories } from "./data";
import type { Order } from "./types";

export type StockRisk = {
  productId: string;
  name: string;
  stock: number;
  avgDailySales: number;
  predicted7DayDemand: number;
  risk: "LOW" | "MEDIUM" | "HIGH";
  suggestedRestock: number;
};

/** Simple statistical demand forecast from catalog signals (review velocity as a stand-in
 *  for real sales history, clearly a heuristic — see docs/AI_ARCHITECTURE.md for the
 *  production version driven by actual order history). */
export function forecastDemand(limit = 8): StockRisk[] {
  return products
    .map((p) => {
      const avgDailySales = Math.max(0.2, Math.round((p.reviewCount / 90) * 10) / 10);
      const predicted7DayDemand = Math.round(avgDailySales * 7);
      const risk: StockRisk["risk"] = p.stock < predicted7DayDemand ? "HIGH" : p.stock < predicted7DayDemand * 2 ? "MEDIUM" : "LOW";
      const suggestedRestock = risk === "HIGH" ? Math.max(0, predicted7DayDemand * 2 - p.stock) : 0;
      return {
        productId: p.id,
        name: p.name,
        stock: p.stock,
        avgDailySales,
        predicted7DayDemand,
        risk,
        suggestedRestock,
      };
    })
    .filter((r) => r.risk !== "LOW")
    .sort((a, b) => (a.risk === "HIGH" ? -1 : 1) - (b.risk === "HIGH" ? -1 : 1))
    .slice(0, limit);
}

export function categoryPerformance() {
  return categories.map((c) => {
    const catProducts = products.filter((p) => p.category === c.name);
    const avgRating = catProducts.reduce((s, p) => s + p.rating, 0) / (catProducts.length || 1);
    const totalReviews = catProducts.reduce((s, p) => s + p.reviewCount, 0);
    const lowStock = catProducts.filter((p) => p.stock < 10).length;
    return { name: c.name, productCount: catProducts.length, avgRating: Math.round(avgRating * 10) / 10, totalReviews, lowStock };
  });
}

export function topProducts(limit = 8) {
  return [...products].sort((a, b) => b.rating * Math.log(b.reviewCount + 1) - a.rating * Math.log(a.reviewCount + 1)).slice(0, limit);
}

export function lowPerformers(limit = 6) {
  return [...products].filter((p) => p.reviewCount > 5).sort((a, b) => a.rating - b.rating).slice(0, limit);
}

export function orderMetrics(orders: Order[]) {
  const revenue = orders.reduce((s, o) => s + o.total, 0);
  const aov = orders.length ? Math.round(revenue / orders.length) : 0;
  return { revenue, orderCount: orders.length, aov };
}

export function generateInsights(orders: Order[]) {
  const insights: { icon: string; text: string }[] = [];
  const risks = forecastDemand(20);
  const highRisk = risks.filter((r) => r.risk === "HIGH");
  if (highRisk.length > 0) {
    insights.push({
      icon: "warning",
      text: `${highRisk.length} product${highRisk.length > 1 ? "s" : ""} may run out of stock within 7 days at current review-velocity trends.`,
    });
  }

  const catPerf = categoryPerformance();
  const topCat = [...catPerf].sort((a, b) => b.totalReviews - a.totalReviews)[0];
  if (topCat) {
    insights.push({ icon: "trend", text: `${topCat.name} has the highest engagement in the catalog — ${topCat.totalReviews} reviews across ${topCat.productCount} products.` });
  }

  const topRated = [...products].filter((p) => p.rating >= 4.6).sort((a, b) => b.reviewCount - a.reviewCount)[0];
  if (topRated) {
    insights.push({ icon: "star", text: `${topRated.name} is trending with a ${topRated.rating}★ rating from ${topRated.reviewCount} reviews.` });
  }

  if (orders.length > 0) {
    const { aov } = orderMetrics(orders);
    insights.push({ icon: "insight", text: `Average order value this session is ₹${aov.toLocaleString("en-IN")} across ${orders.length} order${orders.length > 1 ? "s" : ""}.` });
  } else {
    insights.push({ icon: "insight", text: "No orders placed yet this session — insights will sharpen as activity comes in." });
  }

  return insights;
}
