import { defineConfig } from "vitest/config"
import path from "path"

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // Santaddeo has an isolated Vitest config and a separate Playwright suite.
    // The Platform runner must not load that app with the root `@` alias.
    exclude: ["apps/santaddeo/**", "**/e2e/**", "node_modules/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
})
