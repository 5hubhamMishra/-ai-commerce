# AI-Commerce

An AI-native e-commerce + marketplace platform. Personalized discovery, hybrid recommendations,
semantic search, and a conversational shopping assistant (ShopAI) built on top of a real,
production-shaped commerce foundation — catalog, cart, checkout, orders, payments, returns.

This repository was built incrementally, phase by phase.

## Structure

```
apps/
  web/          Next.js storefront + admin UI, fully wired to the real apps/api: auth, catalog,
                cart/wishlist, checkout/payments, recommendations, ShopAI, and the admin
                dashboard, product reviews, and review submission all call the live backend.
  api/          NestJS modular monolith — REST API, auth, RBAC, commerce domain logic
  mobile/       React Native (Expo) app — catalog, cart, wishlist, checkout, ShopAI, and
                recommendations, all calling the real apps/api via the same API contracts as web
packages/
  types/        Shared TypeScript types (domain models, DTOs)
  config/       Shared runtime configuration helpers
  validation/   Shared request/response validation schemas
  api-client/   Shared fetch client used by apps/web to call apps/api
infrastructure/
  docker/       Local development container definitions
```

## Local development

Prerequisites: Node.js 22+, npm 10+. Postgres and Redis run via Docker Compose (Docker Desktop
required — a no-Docker alternative using a free managed Postgres/Redis instance also works).

```bash
npm install
docker compose up -d          # starts Postgres + Redis
npm run db:generate            # generates the Prisma client
npm run db:migrate             # applies database migrations
# In separate terminals:
npm run dev:api                 # NestJS API on http://localhost:4000
npm run dev:web                 # Next.js app on http://localhost:3000
```

Copy `.env.example` to `apps/api/.env` and fill `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`,
and `ANTHROPIC_API_KEY` before starting the API. The Anthropic key is required at boot even
when ShopAI is not being exercised, so configuration errors fail early and clearly.
`EMBEDDING_PROVIDER=hashing` is the default local mode; set it to `openai`, provide
`OPENAI_API_KEY`, run the admin embedding reindex endpoint, and only then use hosted embeddings.

See `apps/web/README.md` for storefront-specific notes carried over from the original MVP build.
