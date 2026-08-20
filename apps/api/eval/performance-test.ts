/**
 * PROMPT 14 "performance tests" — a lightweight, repeatable local latency baseline for
 * the hottest real endpoints, run against the actual dev server and the real 112-product
 * seed data. Not a substitute for real infrastructure-level load testing (dedicated
 * hardware, sustained soak tests, autoscaling validation) — that belongs with Phase 14's
 * cloud deployment work, once there's real infrastructure to point it at.
 *
 * Deliberately sequential, not a connection-flood load test: the API's global rate
 * limiter (100 req/60s per IP, app.module.ts) is a real, intentional security control
 * (verified in Phase 12 and test/security.e2e-spec.ts) — flooding it from a single IP with
 * a tool like autocannon just measures how fast 429s get rejected, not real endpoint
 * performance. This was tried first and confirmed exactly that (nearly 100% non-2xx once
 * the limit was exceeded, with errors: 0 — the throttler working as designed, not a bug).
 * Sequential requests, spaced out, stay under that limit and measure what actually matters
 * here: real successful-request latency.
 *
 * Usage: from apps/api, with the dev server already running on API_BASE_URL:
 *   npx ts-node eval/performance-test.ts
 */
const BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:4000/api/v1';
const REQUESTS_PER_SCENARIO = 15;
const DELAY_MS = 150; // keeps total requests well under the 100/60s global throttle

type Scenario = { name: string; path: string };

const scenarios: Scenario[] = [
  { name: 'product list (paginated)', path: '/products?page=1&pageSize=20' },
  { name: 'product detail', path: '/products/spigen-extreme-pro-pro-9-p112' },
  { name: 'category browse', path: '/categories/laptops/products' },
  { name: 'keyword search', path: '/search?q=headphones' },
  {
    name: 'semantic/hybrid search with filter',
    path: '/search?q=laptop+under+100000',
  },
  { name: 'category list (small, unpaginated)', path: '/categories' },
];

type ScenarioResult = {
  scenario: string;
  path: string;
  samples: number;
  minMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  non2xx: number;
};

function percentile(sorted: number[], p: number): number {
  const idx = Math.min(
    sorted.length - 1,
    Math.floor((p / 100) * sorted.length),
  );
  return sorted[idx];
}

async function runScenario(scenario: Scenario): Promise<ScenarioResult> {
  const latencies: number[] = [];
  let non2xx = 0;

  for (let i = 0; i < REQUESTS_PER_SCENARIO; i++) {
    const start = performance.now();
    const res = await fetch(`${BASE_URL}${scenario.path}`);
    const elapsed = performance.now() - start;
    latencies.push(elapsed);
    if (!res.ok) non2xx++;
    await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  const sorted = [...latencies].sort((a, b) => a - b);
  return {
    scenario: scenario.name,
    path: scenario.path,
    samples: latencies.length,
    minMs: Math.round(sorted[0]),
    p50Ms: Math.round(percentile(sorted, 50)),
    p95Ms: Math.round(percentile(sorted, 95)),
    maxMs: Math.round(sorted[sorted.length - 1]),
    non2xx,
  };
}

async function main() {
  const results: ScenarioResult[] = [];
  for (const scenario of scenarios) {
    process.stdout.write(`Running: ${scenario.name}...\n`);
    results.push(await runScenario(scenario));
  }

  console.log(
    '\n=== Performance Baseline (sequential, real successful-request latency) ===\n',
  );
  console.table(results);

  const anyErrors = results.some((r) => r.non2xx > 0);
  if (anyErrors) {
    console.error(
      '\nSome requests returned non-2xx — investigate before trusting this baseline.',
    );
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Performance test harness crashed:', err);
  process.exitCode = 1;
});
