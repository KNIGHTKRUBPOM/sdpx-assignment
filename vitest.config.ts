import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/integration/**", "tests/e2e/**"],
    coverage: {
      provider: "v8",
      include: [
        "src/core/**",
        "src/domain/scoring.ts",
        "src/domain/policy.ts",
        "src/domain/pairing.ts",
      ],
    },
  },
});
