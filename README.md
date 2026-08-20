# AI-Commerce

An AI-native e-commerce + marketplace platform. Personalized discovery, hybrid recommendations,
semantic search, and a conversational shopping assistant (ShopAI) built on top of a real,
production-shaped commerce foundation — catalog, cart, checkout, orders, payments, returns.

This repository was built incrementally, phase by phase. See
[`docs/DECISIONS.md`](docs/DECISIONS.md) for the full architecture decision log — the map of
what exists, what's next, and why decisions were made the way they were.

## Structure

```
apps/
  web/          Next.js storefront + admin UI (the original "Veloura" MVP; still reads static
                JSON, not yet wired to apps/api — see docs/DECISIONS.md ADR-027)
  api/          NestJS modular monolith — REST API, auth, RBAC, commerce domain logic
  mobile/       React Native (Expo) app — shares API contracts with web
packages/
  types/        Shared TypeScript types (domain models, DTOs)
  config/       Shared runtime configuration helpers
  validation/   Shared request/response validation schemas
infrastructure/
  docker/       Local development container definitions
docs/           Architecture, database, API, events, AI, security, deployment docs
```

## Local development

Prerequisites: Node.js 22+, npm 10+. Postgres and Redis run via Docker Compose (Docker Desktop
required) — see `docs/DEVELOPMENT.md` for the exact steps and for a no-Docker alternative using a
free managed Postgres/Redis instance.

```bash
npm install
docker compose up -d          # starts Postgres + Redis
npm run db:migrate             # applies database migrations
npm run dev:api                 # NestJS API on http://localhost:4000
npm run dev:web                 # Next.js app on http://localhost:3000
```

See `docs/DEVELOPMENT.md` for the full setup guide, and `apps/web/README.md` for storefront-specific
notes carried over from the original MVP build.
