export default () => ({
  env: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '4000', 10),
  webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
  database: {
    url: process.env.DATABASE_URL,
  },
  redis: {
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshTtlDays: parseInt(process.env.JWT_REFRESH_TTL_DAYS ?? '30', 10),
  },
  returns: {
    // Category.returnWindowDays overrides this per-category when set.
    defaultWindowDays: parseInt(process.env.RETURN_WINDOW_DAYS ?? '10', 10),
  },
  marketplace: {
    // Spec: "Marketplace functionality may be disabled initially through
    // feature flags." A single config switch, not a dynamic feature-flag
    // table (that infrastructure is Phase 6-10's job, per DATABASE.md) —
    // this phase only needs a literal on/off, not per-user/percentage
    // rollout. Off hides seller onboarding/storefront endpoints (still
    // reachable for admins) without touching customer-facing catalog/cart/
    // checkout code at all.
    enabled: process.env.MARKETPLACE_ENABLED !== 'false',
    defaultCommissionRateBps: parseInt(
      process.env.MARKETPLACE_DEFAULT_COMMISSION_BPS ?? '1000',
      10,
    ),
  },
});
