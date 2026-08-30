import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type PreflightMode = 'runtime' | 'build';

type PreflightIssue = {
  key: string;
  reason: string;
};

type PreflightOptions = {
  mode?: PreflightMode;
};

export class ConfigPreflightError extends Error {
  constructor(readonly issues: PreflightIssue[]) {
    super(
      [
        'Invalid environment configuration:',
        ...issues.map((issue) => `  - ${issue.key}: ${issue.reason}`),
      ].join('\n'),
    );
  }
}

export function validateConfigPreflight(
  config: Record<string, unknown>,
  options: PreflightOptions = {},
): PreflightIssue[] {
  const mode = options.mode ?? 'runtime';
  const issues: PreflightIssue[] = [];
  const env = getOptionalString(config, 'NODE_ENV') ?? 'development';
  const paymentProvider =
    getOptionalString(config, 'PAYMENT_PROVIDER') ?? 'development';
  const isVercel = getOptionalString(config, 'VERCEL') === '1';
  const isProductionLike =
    env === 'production' ||
    isVercel ||
    ['production', 'preview'].includes(
      getOptionalString(config, 'VERCEL_ENV') ?? '',
    );

  oneOf(issues, config, 'NODE_ENV', ['development', 'test', 'production'], {
    optional: true,
  });
  positiveInteger(issues, config, 'PORT', { optional: true });
  requiredUrl(issues, config, 'DATABASE_URL', ['postgres:', 'postgresql:']);
  if (mode === 'build' || isVercel) {
    requiredUrl(issues, config, 'DIRECT_URL', ['postgres:', 'postgresql:']);
  } else {
    optionalUrl(issues, config, 'DIRECT_URL', ['postgres:', 'postgresql:']);
  }
  optionalUrl(issues, config, 'REDIS_URL', ['redis:', 'rediss:']);
  secret(issues, config, 'JWT_ACCESS_SECRET', 32);
  secret(issues, config, 'JWT_REFRESH_SECRET', 32);
  originList(issues, config, 'WEB_ORIGIN', true);
  requiredString(issues, config, 'ANTHROPIC_API_KEY');
  optionalNonEmptyString(issues, config, 'ANTHROPIC_MODEL');
  positiveInteger(issues, config, 'SHOPAI_MAX_TOOL_ITERATIONS', {
    optional: true,
  });
  positiveInteger(issues, config, 'RETURN_WINDOW_DAYS', { optional: true });
  boundedInteger(issues, config, 'MARKETPLACE_DEFAULT_COMMISSION_BPS', {
    optional: true,
    min: 0,
    max: 10_000,
  });
  oneOf(issues, config, 'PAYMENT_PROVIDER', ['development', 'razorpay'], {
    optional: true,
  });

  if (paymentProvider === 'razorpay') {
    requiredString(issues, config, 'RAZORPAY_KEY_ID');
    secret(issues, config, 'RAZORPAY_KEY_SECRET', 1);
    secret(issues, config, 'PAYMENT_SECRET', 16);
  } else {
    optionalNonEmptyString(issues, config, 'PAYMENT_SECRET');
  }

  if (isProductionLike) {
    secret(issues, config, 'CRON_SECRET', 16);
  } else {
    optionalNonEmptyString(issues, config, 'CRON_SECRET');
  }

  return issues;
}

export function assertConfigPreflight(
  config: Record<string, unknown>,
  options: PreflightOptions = {},
) {
  const issues = validateConfigPreflight(config, options);
  if (issues.length > 0) throw new ConfigPreflightError(issues);
}

export function loadDotEnvFileIfPresent(
  filePath = resolve(process.cwd(), '.env'),
) {
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) continue;
    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1).trim();
    process.env[key] ??= stripQuotes(rawValue);
  }
}

function getOptionalString(
  config: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = config[key];
  return typeof value === 'string' ? value.trim() : undefined;
}

function requiredString(
  issues: PreflightIssue[],
  config: Record<string, unknown>,
  key: string,
) {
  if (!getOptionalString(config, key)) {
    issues.push({ key, reason: 'is required' });
  }
}

function optionalNonEmptyString(
  issues: PreflightIssue[],
  config: Record<string, unknown>,
  key: string,
) {
  if (config[key] !== undefined && !getOptionalString(config, key)) {
    issues.push({ key, reason: 'must not be empty when set' });
  }
}

function secret(
  issues: PreflightIssue[],
  config: Record<string, unknown>,
  key: string,
  minLength: number,
) {
  const value = getOptionalString(config, key);
  if (!value) {
    issues.push({ key, reason: 'is required' });
    return;
  }
  if (value.length < minLength) {
    issues.push({
      key,
      reason: `must be at least ${minLength} characters`,
    });
  }
}

function oneOf(
  issues: PreflightIssue[],
  config: Record<string, unknown>,
  key: string,
  allowed: string[],
  options: { optional?: boolean } = {},
) {
  const value = getOptionalString(config, key);
  if (!value) {
    if (!options.optional) issues.push({ key, reason: 'is required' });
    return;
  }
  if (!allowed.includes(value)) {
    issues.push({ key, reason: `must be one of: ${allowed.join(', ')}` });
  }
}

function requiredUrl(
  issues: PreflightIssue[],
  config: Record<string, unknown>,
  key: string,
  protocols: string[],
) {
  if (!getOptionalString(config, key)) {
    issues.push({ key, reason: 'is required' });
    return;
  }
  optionalUrl(issues, config, key, protocols);
}

function optionalUrl(
  issues: PreflightIssue[],
  config: Record<string, unknown>,
  key: string,
  protocols: string[],
) {
  const value = getOptionalString(config, key);
  if (!value) return;
  try {
    const url = new URL(value);
    if (!protocols.includes(url.protocol)) {
      issues.push({
        key,
        reason: `must use one of these protocols: ${protocols.join(', ')}`,
      });
    }
  } catch {
    issues.push({ key, reason: 'must be a valid URL' });
  }
}

function originList(
  issues: PreflightIssue[],
  config: Record<string, unknown>,
  key: string,
  required = false,
) {
  const value = getOptionalString(config, key);
  if (!value) {
    if (required) issues.push({ key, reason: 'is required' });
    return;
  }
  for (const origin of value.split(',').map((entry) => entry.trim())) {
    if (!origin) continue;
    try {
      const url = new URL(origin);
      if (!['http:', 'https:'].includes(url.protocol)) {
        issues.push({ key, reason: 'origins must use http or https' });
        return;
      }
    } catch {
      issues.push({ key, reason: 'must be a comma-separated list of URLs' });
      return;
    }
  }
}

function positiveInteger(
  issues: PreflightIssue[],
  config: Record<string, unknown>,
  key: string,
  options: { optional?: boolean } = {},
) {
  boundedInteger(issues, config, key, { ...options, min: 1 });
}

function boundedInteger(
  issues: PreflightIssue[],
  config: Record<string, unknown>,
  key: string,
  options: { optional?: boolean; min?: number; max?: number } = {},
) {
  const value = getOptionalString(config, key);
  if (!value) {
    if (!options.optional) issues.push({ key, reason: 'is required' });
    return;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    issues.push({ key, reason: 'must be an integer' });
    return;
  }
  if (options.min !== undefined && parsed < options.min) {
    issues.push({ key, reason: `must be at least ${options.min}` });
  }
  if (options.max !== undefined && parsed > options.max) {
    issues.push({ key, reason: `must be at most ${options.max}` });
  }
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

if (require.main === module) {
  loadDotEnvFileIfPresent();
  try {
    assertConfigPreflight(process.env, { mode: 'build' });
    process.stdout.write('Configuration preflight passed.\n');
  } catch (error) {
    if (error instanceof ConfigPreflightError) {
      process.stderr.write(`${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }
}
