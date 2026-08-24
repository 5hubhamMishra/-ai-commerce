/**
 * Guarded concurrency harness for Preview/test environments with synthetic data.
 *
 * Usage from apps/api:
 *   LOAD_TEST_BASE_URL=http://localhost:4000/api/v1 LOAD_TEST_TARGET_ENV=local npm run load:test
 *
 * Non-local targets also require:
 *   LOAD_TEST_SYNTHETIC_DATASET=true
 *   LOAD_TEST_ALLOWED_HOSTS=<exact-hostname>
 */
import autocannon from 'autocannon';
import {
  buildLoadTestPlan,
  LoadTestScenario,
} from '../src/diagnostics/load-test-plan';

type ScenarioResult = {
  scenario: string;
  path: string;
  requests: number;
  connections: number;
  p50Ms: number;
  p97_5Ms: number;
  maxMs: number;
  requestsPerSecond: number;
  non2xx: number;
  errors: number;
  timeouts: number;
};

async function runScenario(
  scenario: LoadTestScenario,
  plan: ReturnType<typeof buildLoadTestPlan>,
): Promise<ScenarioResult> {
  const result = await autocannon({
    url: `${plan.baseUrl}${scenario.path}`,
    connections: plan.connections,
    pipelining: plan.pipelining,
    amount: plan.requestsPerScenario,
  });

  return {
    scenario: scenario.name,
    path: scenario.path,
    requests: plan.requestsPerScenario,
    connections: plan.connections,
    p50Ms: Math.round(result.latency.p50),
    p97_5Ms: Math.round(result.latency.p97_5),
    maxMs: Math.round(result.latency.max),
    requestsPerSecond: Math.round(result.requests.average),
    non2xx: result.non2xx,
    errors: result.errors,
    timeouts: result.timeouts,
  };
}

async function main() {
  const plan = buildLoadTestPlan();
  const results: ScenarioResult[] = [];

  console.log(
    `Running guarded load test against ${plan.baseUrl} (${plan.targetEnv}, ${plan.connections} connections, ${plan.requestsPerScenario} requests/scenario).`,
  );

  for (const scenario of plan.scenarios) {
    process.stdout.write(`Running: ${scenario.name}...\n`);
    results.push(await runScenario(scenario, plan));
  }

  console.log('\n=== Guarded Load Test Results ===\n');
  console.table(results);

  const failed = results.filter(
    (result) =>
      result.errors > 0 ||
      result.timeouts > 0 ||
      result.non2xx > 0 ||
      (plan.maxP97_5Ms !== undefined && result.p97_5Ms > plan.maxP97_5Ms),
  );

  if (failed.length > 0) {
    console.error(
      '\nLoad test failed: one or more scenarios had errors, timeouts, non-2xx responses, or exceeded LOAD_TEST_MAX_P97_5_MS.',
    );
    process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  console.error('Load test harness crashed:', err);
  process.exitCode = 1;
});
