import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // Several workers hammering axe-core scans against one local server concurrently caused
  // a real timeout in this sandbox (not a real a11y regression — the same suite passes
  // cleanly in isolation). Same class of resource contention already documented for
  // apps/api's e2e suite (docs/PROJECT_PROGRESS.md, Phase 10) — capping workers there
  // fixed it the same way.
  workers: process.env.CI ? undefined : 3,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  // The default 30s is occasionally too tight for the shop page's axe-core scan under
  // this sandbox's parallel-worker contention now that the catalog has grown to 168
  // products across 12 categories (more DOM to scan) — same contention noted above, just
  // needs a bit more headroom, not a real slowdown in the app itself.
  timeout: 45_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  webServer: {
    // A production build, not `next dev` — dev mode compiles each route on first hit,
    // which under real load (parallel test workers hitting many routes at once) blew
    // well past Playwright's default assertion timeouts and looked like broken
    // navigation. A prod server has no such warm-up latency and is what these flows
    // will actually run as.
    command: `npx next build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
