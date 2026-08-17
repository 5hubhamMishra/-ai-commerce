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
});
