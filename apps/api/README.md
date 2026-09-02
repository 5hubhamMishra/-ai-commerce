# Veloura API

The NestJS API for Veloura's catalog, authentication, commerce, reviews,
recommendations, ShopAI, analytics, and admin operations. Versioned routes are
served under `/api/v1`; `/health` is liveness and `/ready` checks PostgreSQL.

## Local setup

From the repository root:

```bash
npm install
docker compose up -d
cp .env.example apps/api/.env
npm run db:generate
npm run db:migrate
npm run dev:api
```

Fill the required secrets in `apps/api/.env` before starting the API. The local
default uses the hashing embedding provider and the development payment
provider. See the root README for the shared web and mobile setup.

## Commands

```bash
npm run start:dev       # watch mode
npm run build           # production build
npm test -- --runInBand # unit tests
npm run test:e2e        # PostgreSQL/Redis-backed integration tests
npm run config:preflight
npm run prisma:migrate
npm run prisma:generate
```

The e2e suite requires reachable PostgreSQL and Redis services. The load-test
and evaluation scripts require an explicit non-production target.

## Deployment

The API deploys from the `apps/api` Vercel Root Directory. Its `vercel.json`
build command runs configuration preflight, applies Prisma migrations, generates
the Prisma client, and builds Nest. Configure production secrets in Vercel,
never in source control. `PAYMENT_PROVIDER=razorpay` and
`EMBEDDING_PROVIDER=openai` require their corresponding provider credentials.
