import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Mirrors tsconfig.json's "@/*" path alias so tests can import
    // production modules the same way the app does.
    alias: {
      "@": path.resolve(__dirname),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
  },
});
