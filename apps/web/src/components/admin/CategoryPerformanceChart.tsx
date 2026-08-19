"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

type CategoryPerf = { name: string; productCount: number; avgRating: number; totalReviews: number; lowStock: number };

export default function CategoryPerformanceChart({ data }: { data: CategoryPerf[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 4 }}>
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--clr-text-secondary)' }} />
        <YAxis tick={{ fontSize: 10, fill: 'var(--clr-text-disabled)' }} />
        <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12, border: '1px solid var(--clr-border)' }} />
        <Bar dataKey="productCount" radius={[6, 6, 0, 0]} fill="var(--clr-accent)" />
      </BarChart>
    </ResponsiveContainer>
  );
}
