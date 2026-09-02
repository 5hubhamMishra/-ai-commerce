export default () => ({
  env: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '4000', 10),
  // Comma-separated allow-list, not a single origin — local dev legitimately needs more
  // than one (npm run dev:web on 3000, apps/web's Playwright suite building+serving its
  // own instance on 3100 to avoid dev-mode compile latency under parallel workers).
  webOrigin: (process.env.WEB_ORIGIN ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  database: {
    url: process.env.DATABASE_URL,
  },
  redis: {
    url:
      process.env.REDIS_URL?.trim() ||
      (process.env.VERCEL === '1' ? undefined : 'redis://localhost:6379'),
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
  shopai: {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    // claude-opus-5 by default — configurable per deployment, not hard-coded
    // throughout the codebase (same "centralized, not scattered" principle
    // as recommendation-config.ts/search-config.ts).
    model: process.env.ANTHROPIC_MODEL ?? 'claude-opus-5',
    maxToolIterations: parseInt(
      process.env.SHOPAI_MAX_TOOL_ITERATIONS ?? '6',
      10,
    ),
  },
  embeddings: {
    provider: process.env.EMBEDDING_PROVIDER?.trim() || 'hashing',
    openaiApiKey: process.env.OPENAI_API_KEY,
  },
  payments: {
    // Verifies the (development-simulated, or real Razorpay) provider webhook's HMAC
    // signature. Unset means "reject every webhook" (fail closed) — never "accept every
    // webhook", so a misconfigured deployment can't silently accept forged payment-succeeded
    // events. Shared across whichever provider is active, not one secret per provider.
    webhookSecret: process.env.PAYMENT_SECRET,
    // 'development' | 'razorpay' — selects which PaymentProvider payments.module.ts binds.
    // Defaults to 'development' so every existing dev/test/e2e environment (including the
    // whole e2e suite) is unaffected without needing any env changes.
    provider: process.env.PAYMENT_PROVIDER ?? 'development',
    razorpay: {
      keyId: process.env.RAZORPAY_KEY_ID,
      keySecret: process.env.RAZORPAY_KEY_SECRET,
    },
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
