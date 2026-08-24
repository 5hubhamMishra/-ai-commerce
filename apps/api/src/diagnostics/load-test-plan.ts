export type LoadTestTargetEnv = 'local' | 'preview' | 'staging' | 'test';

export type LoadTestScenario = {
  name: string;
  path: string;
};

export type LoadTestPlan = {
  baseUrl: string;
  targetEnv: LoadTestTargetEnv;
  connections: number;
  pipelining: number;
  requestsPerScenario: number;
  maxP97_5Ms?: number;
  scenarios: LoadTestScenario[];
};

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const ALLOWED_TARGET_ENVS = new Set<LoadTestTargetEnv>([
  'local',
  'preview',
  'staging',
  'test',
]);

// No 'health' scenario here on purpose: /health is deliberately excluded from the
// global /api/v1 prefix (main.ts), so it can't share this plan's baseUrl + path
// concatenation the way every real API route can — every request would 404.
export const DEFAULT_LOAD_TEST_SCENARIOS: LoadTestScenario[] = [
  { name: 'product list', path: '/products?page=1&pageSize=20' },
  { name: 'product detail', path: '/products/spigen-extreme-pro-pro-9-p112' },
  { name: 'category browse', path: '/categories/laptops/products' },
  { name: 'keyword search', path: '/search?q=headphones' },
  { name: 'category list', path: '/categories' },
];

export function buildLoadTestPlan(
  env: NodeJS.ProcessEnv = process.env,
): LoadTestPlan {
  const baseUrl = normalizeBaseUrl(requiredEnv(env, 'LOAD_TEST_BASE_URL'));
  const targetEnv = parseTargetEnv(requiredEnv(env, 'LOAD_TEST_TARGET_ENV'));
  const url = new URL(baseUrl);

  assertSafeLoadTarget({
    hostname: url.hostname,
    targetEnv,
    allowedHosts: splitCsv(env.LOAD_TEST_ALLOWED_HOSTS),
    syntheticDataset: env.LOAD_TEST_SYNTHETIC_DATASET,
  });

  return {
    baseUrl,
    targetEnv,
    connections: parseBoundedInteger(env.LOAD_TEST_CONNECTIONS, {
      fallback: 4,
      min: 1,
      max: 20,
      name: 'LOAD_TEST_CONNECTIONS',
    }),
    pipelining: parseBoundedInteger(env.LOAD_TEST_PIPELINING, {
      fallback: 1,
      min: 1,
      max: 4,
      name: 'LOAD_TEST_PIPELINING',
    }),
    requestsPerScenario: parseBoundedInteger(
      env.LOAD_TEST_REQUESTS_PER_SCENARIO,
      {
        fallback: 10,
        min: 1,
        max: 100,
        name: 'LOAD_TEST_REQUESTS_PER_SCENARIO',
      },
    ),
    maxP97_5Ms: parseOptionalBoundedInteger(env.LOAD_TEST_MAX_P97_5_MS, {
      min: 1,
      max: 60_000,
      name: 'LOAD_TEST_MAX_P97_5_MS',
    }),
    scenarios: DEFAULT_LOAD_TEST_SCENARIOS,
  };
}

function requiredEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for load testing.`);
  }
  return value;
}

export function normalizeBaseUrl(rawBaseUrl: string): string {
  const url = new URL(rawBaseUrl);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('LOAD_TEST_BASE_URL must use http or https.');
  }
  url.hash = '';
  url.search = '';
  return url.toString().replace(/\/$/, '');
}

function parseTargetEnv(rawTargetEnv: string): LoadTestTargetEnv {
  const targetEnv = rawTargetEnv.trim().toLowerCase();
  if (targetEnv === 'prod' || targetEnv === 'production') {
    throw new Error('Production load testing is refused by this harness.');
  }
  if (!ALLOWED_TARGET_ENVS.has(targetEnv as LoadTestTargetEnv)) {
    throw new Error(
      'LOAD_TEST_TARGET_ENV must be one of local, preview, staging, or test.',
    );
  }
  return targetEnv as LoadTestTargetEnv;
}

function assertSafeLoadTarget({
  hostname,
  targetEnv,
  allowedHosts,
  syntheticDataset,
}: {
  hostname: string;
  targetEnv: LoadTestTargetEnv;
  allowedHosts: string[];
  syntheticDataset?: string;
}) {
  const normalizedHost = hostname.toLowerCase();
  if (
    normalizedHost.includes('prod') ||
    normalizedHost.includes('production')
  ) {
    throw new Error('Production-looking hostnames are refused.');
  }

  if (targetEnv === 'local') {
    if (!LOCAL_HOSTS.has(normalizedHost)) {
      throw new Error('LOAD_TEST_TARGET_ENV=local only permits localhost.');
    }
    return;
  }

  if (syntheticDataset?.toLowerCase() !== 'true') {
    throw new Error(
      'Non-local load tests require LOAD_TEST_SYNTHETIC_DATASET=true.',
    );
  }

  if (
    !allowedHosts.map((host) => host.toLowerCase()).includes(normalizedHost)
  ) {
    throw new Error(
      'Non-local load tests require LOAD_TEST_ALLOWED_HOSTS to include the exact target hostname.',
    );
  }
}

function splitCsv(value?: string): string[] {
  return (
    value
      ?.split(',')
      .map((item) => item.trim())
      .filter(Boolean) ?? []
  );
}

function parseOptionalBoundedInteger(
  rawValue: string | undefined,
  options: { min: number; max: number; name: string },
): number | undefined {
  if (!rawValue?.trim()) return undefined;
  return parseBoundedInteger(rawValue, { ...options, fallback: options.min });
}

function parseBoundedInteger(
  rawValue: string | undefined,
  options: { fallback: number; min: number; max: number; name: string },
): number {
  if (!rawValue?.trim()) return options.fallback;
  const parsed = Number(rawValue);
  if (
    !Number.isInteger(parsed) ||
    parsed < options.min ||
    parsed > options.max
  ) {
    throw new Error(
      `${options.name} must be an integer between ${options.min} and ${options.max}.`,
    );
  }
  return parsed;
}
