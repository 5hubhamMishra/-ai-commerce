# Veloura

A personalized shopping storefront: catalog browsing, natural-language search, cart and
checkout, a rule-based recommendation engine, and a conversational shopping assistant
(ShopAI) that only ever shows real catalog products. Built with Next.js (App Router),
TypeScript, Tailwind CSS, and Zustand.

This is a working MVP scoped down from a much larger platform specification (see
`docs/ARCHITECTURE.md` and `docs/SCOPE_NOTES.md`) — it runs entirely client-side with no
external database, so it's free to host and has nothing to configure.

## What's implemented

- Catalog of 112 seeded products across 8 categories with realistic specs, pricing, and
  reviews (`scripts/generate-seed.mjs`).
- Product browsing, category pages, filters, sorting, product detail, reviews, compare.
- Natural-language search that parses budget, category, brand, and use case
  (`src/lib/search.ts`).
- Cart, wishlist, and a simulated checkout / order tracking flow.
- A behavioral event log (product views, searches, cart adds, wishlist, etc.) stored per
  browser, which drives:
  - A customer profile (category/brand affinity, segment, lifecycle stage) —
    `src/lib/recommend.ts: buildProfile`.
  - A hybrid recommendation engine (content similarity + behavioral score + recency decay +
    popularity fallback) — `src/lib/recommend.ts: recommendForProfile`.
  - Explainable recommendations ("Recommended because...") shown on product cards.
- ShopAI: a deterministic, rule-based shopping assistant that parses requests, searches the
  real catalog, and answers follow-ups ("cheaper options", "compare these", "why did you
  recommend this") without ever inventing a product.
- A business dashboard (`/admin`) with catalog analytics, a simple stockout-risk forecast,
  and insights generated from real data (not fabricated).
- Privacy controls in `/profile`: personalization on/off, export activity, delete activity.

## What's intentionally out of scope for this MVP

The original spec describes a full microservice platform (NestJS API, Python AI service,
Postgres + pgvector, Redis, Kafka/SQS, Terraform, multi-tenant admin, real payments, etc.).
Building and hosting all of that requires infrastructure accounts (a managed Postgres
instance, a cloud host with billing, a payment provider) that only you can provision. This
MVP keeps the same product behavior and the same algorithmic approach (rule-based +
content-based + collaborative-style signals, hybrid search, explainable ranking) but runs
it client-side against seeded data, so it deploys as a static/serverless site for free with
zero configuration. See `docs/SCOPE_NOTES.md` for the mapping from spec section to what's
implemented, simplified, or deferred, and `docs/NEXT_STEPS.md` for how to grow this into the
full architecture.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Deploy it live (free, ~2 minutes)

The fastest path is Vercel, since this is a Next.js app:

1. Push this folder to a new GitHub repository (or use the zip you were given — create a
   repo on GitHub and push it there).
2. Go to https://vercel.com/new, sign in with GitHub, and import the repository.
3. Leave all settings at their defaults (Vercel auto-detects Next.js) and click **Deploy**.
4. You'll get a public `https://<project>.vercel.app` URL in about a minute.

No environment variables or database are required — everything runs client-side against the
seeded catalog.

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
    data.ts        Catalog accessors
    data/           Seeded product/review/category JSON
    recommend.ts    Customer profile + hybrid recommendation engine
    search.ts       Natural-language query parsing + search ranking
    shopai.ts       ShopAI conversational assistant logic
    admin.ts        Business dashboard analytics + demand forecast
    store.ts        Zustand store (cart, wishlist, events, orders) — persisted to
                     localStorage, so activity is per-browser in this demo
scripts/
  generate-seed.mjs         Regenerates the product/review catalog
  generate-images.mjs       Regenerates category artwork
  generate-brand-assets.mjs Regenerates favicon/OG image
```

## Progressive Web App

The site ships a web manifest and icons, so it can be installed to a phone or desktop home
screen from the browser (Add to Home Screen / Install app).
