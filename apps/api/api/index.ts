import type { IncomingMessage, ServerResponse } from 'http';
import { ExpressAdapter } from '@nestjs/platform-express';
import express from 'express';
// Imports the *compiled* output (nest build, real tsc — correctly emits the
// `emitDecoratorMetadata` Reflect calls NestJS's DI needs), not the TypeScript source.
// Vercel bundles each `api/*.ts` function with esbuild, which does not implement
// `emitDecoratorMetadata` at all — bundling AppModule's decorated classes straight from
// source would silently produce a DI graph where every constructor parameter type is
// `undefined`, breaking every `@Injectable()` at runtime with no useful error. Routing
// this import through the real tsc output (already-plain JS, decorators already resolved
// to metadata calls) sidesteps the incompatibility entirely. `vercel.json`'s
// `buildCommand` (`npm run build`, i.e. `nest build`) runs before Vercel builds anything
// under `api/`, so `dist/src/create-app.js` always exists by the time this file is bundled.
// TypeScript/VS Code can type this from source without needing generated dist files present.
const { createApp } = require('../dist/src/create-app.js') as {
  createApp: typeof import('../src/create-app').createApp;
};

/**
 * Vercel serverless entrypoint. A Vercel Function is request-scoped and terminates
 * between invocations — it can't `app.listen()` on a port the way main.ts does for local
 * dev. Instead: build NestJS on top of a plain Express instance (not NestJS's own
 * `app.listen()`), then forward each incoming request/response pair to that Express app
 * directly. `bootstrapPromise` is a module-level singleton so a *warm* instance (Vercel
 * reuses instances across nearby invocations) only pays NestJS's DI-container boot cost
 * once, not on every request — cold starts still pay it, same as any serverless app with
 * a real dependency graph.
 *
 * Routing: vercel.json rewrites every path to this one function, and Express's own
 * router (already configured with the app's real routes via AppModule) does the actual
 * path matching from there — Vercel doesn't need to know about `/api/v1/*` vs
 * `/health`/`/ready` at all.
 */
const expressApp = express();
let bootstrapPromise: Promise<void> | null = null;

async function ensureBootstrapped(): Promise<void> {
  const app = await createApp(new ExpressAdapter(expressApp));
  await app.init();
}

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  bootstrapPromise ??= ensureBootstrapped();
  try {
    await bootstrapPromise;
  } catch (err) {
    // A failed boot (e.g. the DB was briefly unreachable) must not permanently wedge this
    // warm instance — clear the cached promise so the next invocation gets a fresh
    // attempt instead of replaying the same rejection forever.
    bootstrapPromise = null;
    throw err;
  }
  expressApp(req, res);
}
