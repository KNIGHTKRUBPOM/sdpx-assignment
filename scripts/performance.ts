import { spawn, spawnSync } from "node:child_process";
import { readFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout } from "node:timers/promises";
import { encode } from "next-auth/jwt";
import { connectDatabase } from "../src/db/client";
import { users } from "../src/db/schema";
import { PairEvalService } from "../src/domain/service";
import type { Principal } from "../src/domain/model";

if (
  !process.env.TEST_DATABASE_URL ||
  !new URL(process.env.TEST_DATABASE_URL).pathname.endsWith("_test")
)
  throw new Error(
    "Use scripts/test-database.ts perf; never load test real student data",
  );
const { db, client } = connectDatabase(process.env.TEST_DATABASE_URL);
const owner = {
  id: crypto.randomUUID(),
  email: "performance@example.edu",
  name: "Performance fixture",
};
const service = new PairEvalService(db, [owner.email], "test-only"),
  ctx = (user: Principal) => ({ user, requestId: crypto.randomUUID() });
await db.insert(users).values(owner);
const room = await service.createClassroom(ctx(owner), {
  name: "30-user load test",
  slug: "performance",
  domains: ["example.edu"],
});
const rows = Array.from(
  { length: 30 },
  (_, i) => `load${i}@example.edu,Group ${Math.floor(i / 5)},Load ${i}`,
);
await service.importRoster(
  ctx(owner),
  room.id,
  `email,group_name,display_name\n${rows.join("\n")}`,
);
const roster = await service.roster(ctx(owner), room.id);
for (const group of roster.groups)
  await service.updateArtifact(ctx(owner), room.id, group.id, {
    artifactUrl: "https://example.edu/work",
  });
const assignment = await service.createAssignment(ctx(owner), {
  classroomId: room.id,
  name: "Load baseline",
  opensAt: new Date(Date.now() - 60000).toISOString(),
  closesAt: new Date(Date.now() + 3600000).toISOString(),
  config: {},
  criteria: [
    { id: "g", name: "Quality", side: "GROUP", weightPct: 100 },
    { id: "i", name: "Teamwork", side: "INDIVIDUAL", weightPct: 100 },
  ],
});
await service.publish(ctx(owner), assignment.id, {
  acceptReducedCoverage: true,
});
const identities = await Promise.all(
  roster.members
    .filter((m) => m.role === "STUDENT")
    .map(async (s) => ({
      cookie: await encode({
        token: { userId: s.id, email: s.email, name: s.name },
        secret: process.env.NEXTAUTH_SECRET!,
        maxAge: 3600,
      }),
    })),
);
await client.end();
await mkdir("performance/results", { recursive: true });
const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "0.0.0.0",
    "--port",
    "3100",
  ],
  { stdio: "ignore", env: process.env, windowsHide: true },
);
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch("http://localhost:3100/api/health")).ok) {
        ready = true;
        break;
      }
    } catch {}
    await setTimeout(500);
  }
  if (!ready) throw new Error("Production server did not start");
  const fixture = {
    baseUrl: "http://host.docker.internal:3100",
    origin: "http://localhost:3100",
    assignmentId: assignment.id,
    users: identities,
  };
  const result = spawnSync(
    "docker",
    [
      "run",
      "--rm",
      "-i",
      ...(process.platform === "linux" && process.getuid && process.getgid
        ? ["--user", `${process.getuid()}:${process.getgid()}`]
        : []),
      "--add-host",
      "host.docker.internal:host-gateway",
      "-e",
      "TEST_FIXTURE",
      "--mount",
      `type=bind,source=${resolve("performance/results")},target=/results`,
      "grafana/k6:1.3.0",
      "run",
      "--summary-export=/results/baseline.json",
      "-",
    ],
    {
      env: { ...process.env, TEST_FIXTURE: JSON.stringify(fixture) },
      input: await readFile("performance/load-test.js", "utf8"),
      encoding: "utf8",
      timeout: 120000,
      windowsHide: true,
    },
  );
  console.log(result.stdout);
  if (result.stderr) console.error(result.stderr);
  process.exitCode = result.status ?? 1;
} finally {
  server.kill();
}
