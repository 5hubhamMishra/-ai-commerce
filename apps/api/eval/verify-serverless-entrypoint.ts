/**
 * One-off local verification that the Vercel serverless entrypoint (api/index.ts) —
 * ExpressAdapter + app.init() + per-request forwarding, module-scope bootstrap caching —
 * actually boots NestJS's full DI graph and serves real requests, before relying on a
 * full Vercel build/deploy cycle to find out. Runs against whatever DATABASE_URL/REDIS_URL
 * are in the local environment (the local Docker Postgres/Redis stand in for Neon/Upstash
 * here — the bootstrap code path being tested is identical either way).
 *
 * Usage: from apps/api, after `npm run build`:
 *   npx ts-node -r tsconfig-paths/register eval/verify-serverless-entrypoint.ts
 */
import http from 'http';
import handler from '../api/index';

const PORT = 4100;

async function main() {
  const server = http.createServer((req, res) => {
    handler(req, res).catch((err) => {
      console.error('Handler error:', err);
      if (!res.headersSent) res.writeHead(500).end('Internal error');
    });
  });

  await new Promise<void>((resolve) => server.listen(PORT, resolve));
  console.log(`Test server listening on http://localhost:${PORT}`);

  const checks: [string, string][] = [
    ['GET', '/health'],
    ['GET', '/ready'],
    ['GET', '/api/v1/products?pageSize=1'],
    ['GET', '/api/v1/categories'],
    ['GET', '/api/v1/does-not-exist'],
  ];

  for (const [method, path] of checks) {
    const res = await fetch(`http://localhost:${PORT}${path}`, { method });
    const body = await res.text();
    console.log(`${method} ${path} -> ${res.status}`, body.slice(0, 150));
  }

  // Second request on the same warm process — proves bootstrapPromise caching works
  // (no re-running NestFactory.create on every request).
  const start = Date.now();
  await fetch(`http://localhost:${PORT}/health`);
  console.log(`Second request (warm) took ${Date.now() - start}ms`);

  server.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('Verification script crashed:', err);
  process.exit(1);
});
