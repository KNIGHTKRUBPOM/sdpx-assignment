import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import { connectDatabase } from "../src/db/client";
import { migrate } from "drizzle-orm/postgres-js/migrator";

const mode = process.argv[2] || "integration";
const name = `paireval-test-${randomBytes(5).toString("hex")}`;
const password = randomBytes(24).toString("hex");
function docker(args: string[]) {
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    env: { ...process.env, POSTGRES_PASSWORD: password },
  });
  if (result.status !== 0)
    throw new Error(result.stderr || result.error?.message || "Docker failed");
  return result.stdout.trim();
}
let started = false;
try {
  docker([
    "run",
    "--rm",
    "-d",
    "--name",
    name,
    "-e",
    "POSTGRES_PASSWORD",
    "-e",
    "POSTGRES_DB=paireval_test",
    "-p",
    "127.0.0.1::5432",
    "--tmpfs",
    "/var/lib/postgresql/data",
    "postgres:17.6-alpine",
  ]);
  started = true;
  const mapping = docker(["port", name, "5432/tcp"]);
  const port = mapping.split(":").at(-1);
  const url = `postgresql://postgres:${password}@127.0.0.1:${port}/paireval_test`;
  const { db, client } = connectDatabase(url);
  try {
    let ready = false;
    for (let i = 0; i < 30; i++) {
      try {
        await client`select 1`;
        ready = true;
        break;
      } catch {
        await setTimeout(500);
      }
    }
    if (!ready) throw new Error("PostgreSQL did not become ready");
    await migrate(db, { migrationsFolder: "./drizzle" });
  } finally {
    await client.end();
  }
  const env = {
    ...process.env,
    TEST_DATABASE_URL: url,
    DATABASE_URL: url,
    NEXTAUTH_URL: "http://localhost:3100",
    NEXTAUTH_SECRET: randomBytes(32).toString("hex"),
    INITIAL_OWNER_EMAILS: "owner@example.edu",
    GOOGLE_CLIENT_ID: "e2e-client",
    GOOGLE_CLIENT_SECRET: randomBytes(16).toString("hex"),
  };
  const command =
    mode === "ops"
      ? ["--import", "tsx", "scripts/test-operations.ts"]
      : mode === "perf"
        ? ["--import", "tsx", "scripts/performance.ts"]
        : mode === "e2e"
          ? [
              "node_modules/@playwright/test/cli.js",
              "test",
              ...process.argv.slice(3),
            ]
          : [
              "node_modules/vitest/vitest.mjs",
              "run",
              "--config",
              "vitest.integration.config.ts",
            ];
  const result = spawnSync(process.execPath, command, {
    stdio: "inherit",
    env,
  });
  process.exitCode = result.status ?? 1;
} finally {
  if (started) docker(["stop", name]);
}
