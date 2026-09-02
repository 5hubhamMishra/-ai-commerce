# Veloura

A personalized shopping storefront: catalog browsing, natural-language search, cart and
checkout, a rule-based recommendation engine, and a conversational shopping assistant
(ShopAI) that only ever shows real catalog products. Built with Next.js (App Router),
TypeScript, Tailwind CSS, and Zustand.

This is the web client in the monorepo. It uses the NestJS API for the real catalog, account,
commerce, review, recommendation, and ShopAI flows. A small seeded demo catalog remains as a
graceful fallback during local development when the API is unavailable. Production builds never
expose those fabricated records; they require the deployed API for catalog content.

## What's implemented

- Catalog browsing across seeded API data, with a small presentation-catalog fallback in
  `src/lib/demo-catalog.ts`.
- Product browsing, category pages, filters, sorting, product detail, reviews, compare.
- Natural-language API search with budget, category, brand, and use-case filters.
- Server-backed cart, wishlist, checkout, orders, payments, addresses, and order tracking.
- Product recommendations, review submission for verified purchases, and privacy controls.
- ShopAI backed by the API, with demo fallback responses when the API is unavailable.
- An admin dashboard (`/admin`) with catalog analytics, stockout-risk forecasting, insights,
  and personalization queue health.

## Current scope boundary

The separate API service owns persistence and business rules. Kafka/SQS-style event transport,
multi-tenant administration, object storage, and external notification channels remain outside
the current single-store scope. Local development uses Docker Postgres and Redis; production
requires a deployed API and managed infrastructure.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. With no API configured, the development storefront falls back to
demo data; set `NEXT_PUBLIC_API_URL` in `apps/web/.env.local` for the full experience. For the API
and database setup, use the repository root README.

## Deploy the web client

The fastest path is Vercel, since this is a Next.js app:

1. Import the repository into Vercel and set the project Root Directory to `apps/web`.
2. Set `NEXT_PUBLIC_API_URL` to the deployed API's `/api/v1` URL.
3. Deploy the web app, then configure the API's `WEB_ORIGIN` with the resulting storefront URL.

Vercel builds fail early when `NEXT_PUBLIC_API_URL` is missing, rather than shipping a
storefront that silently targets localhost.

The demo fallback can run without an API, but authenticated commerce and live catalog data
require the API and its database/Redis services.

Alternative: from your own machine, with the Vercel CLI installed:

```bash
npm install -g vercel
vercel
```

Follow the prompts (first deploy will ask you to log in and link a project) — it deploys to
a public URL directly from your terminal.

## Project structure

```
src/
  app/            Next.js routes (one folder per page)
  components/      Shared UI (Navbar, ProductCard, Filters, ...)
  lib/
    demo-catalog.ts Demo catalog and offline fallback accessors
    demo-shopai.ts  Offline ShopAI fallback responses
    store.ts        Session and local UI state; server cart/wishlist/order actions use the API
scripts/
  generate-seed.mjs         Regenerates the product/review catalog
  generate-images.mjs       Regenerates category artwork
  generate-brand-assets.mjs Regenerates favicon/OG image
```

## Progressive Web App

The site ships a web manifest and icons, so it can be installed to a phone or desktop home
screen from the browser (Add to Home Screen / Install app).
