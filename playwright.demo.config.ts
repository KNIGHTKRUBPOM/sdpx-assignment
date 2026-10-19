import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({
  ...base, testDir: "./tests/demo", timeout: 120_000,
  use: { ...base.use, baseURL: "http://localhost:3101" },
  webServer: {
    command: "node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3101",
    url: "http://localhost:3101/api/health", reuseExistingServer: false, timeout: 60_000,
  },
});
