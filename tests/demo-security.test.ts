import { afterEach, describe, expect, it, vi } from "vitest";
import { demoEnabled } from "../src/demo/config";

const local = { DEMO_MODE: "true", DATABASE_URL: "postgresql://127.0.0.1:5432/paireval_demo", NEXTAUTH_URL: "http://localhost:3101" };
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
describe("local demo isolation", () => {
  it("requires explicit opt-in and an isolated loopback database/site", () => {
    expect(demoEnabled({})).toBe(false);
    expect(demoEnabled(local)).toBe(true);
  });
  it.each([
    { VERCEL: "1" }, { VERCEL_ENV: "production" }, { VERCEL_URL: "example.vercel.app" },
    { DATABASE_URL: "postgresql://db.example.com/paireval_demo" },
    { DATABASE_URL: "postgresql://127.0.0.1/paireval" },
    { DATABASE_URL: "postgresql://127.0.0.1/paireval_test" },
    { NEXTAUTH_URL: "https://paireval-pilot.vercel.app" },
    { NEXTAUTH_URL: "http://localhost.evil.example:3101" },
    { DATABASE_URL: "invalid-url" },
  ])("refuses cloud, production or other databases: %j", (change) => {
    expect(() => demoEnabled({ ...local, ...change })).toThrow("Demo requires");
  });
  it("has no credentials provider in the production authentication configuration", async () => {
    vi.stubEnv("DEMO_MODE", "");
    const { authOptions } = await import("../src/auth");
    expect(authOptions.providers.some((p) => p.type === "credentials")).toBe(false);
  });
  it("fails authentication initialization rather than enabling demo on Vercel", async () => {
    for (const [key, value] of Object.entries({ ...local, VERCEL: "1" })) vi.stubEnv(key, value);
    await expect(import("../src/auth")).rejects.toThrow("Demo requires");
  });
});
