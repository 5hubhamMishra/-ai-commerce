import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // The default "forks" pool hangs waiting for its worker to respond locally;
    // "threads" starts reliably here.
    pool: "threads",
    coverage: {
      provider: "v8",
      include: ["src/lib/**"],
    },
  },
});
