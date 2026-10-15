import { strict as assert } from "node:assert";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { connectDatabase } from "../src/db/client";
import { PairEvalService } from "../src/domain/service";
import * as t from "../src/db/schema";

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw new Error("Requires disposable test database");
const { db, client } = connectDatabase(url);
const password = randomBytes(24).toString("hex"),
  key = randomBytes(32).toString("hex");
async function run(
  script: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  succeeds = true,
) {
  const code = await new Promise<number | null>((done, reject) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", script, ...args],
      {
        env: { ...process.env, ...env },
        stdio: succeeds ? "inherit" : "ignore",
        windowsHide: true,
      },
    );
    child.on("error", reject);
    child.on("close", done);
  });
  assert.equal(code === 0, succeeds, `${script} unexpected exit`);
}
try {
  await run("scripts/provision-runtime.ts", [], {
    MIGRATION_DATABASE_URL: url,
    APP_DATABASE_PASSWORD: password,
  });
  const runtimeUrl = new URL(url);
  runtimeUrl.username = "paireval_app";
  runtimeUrl.password = password;
  const runtime = connectDatabase(runtimeUrl.toString());
  const user = {
    id: randomUUID(),
    email: "restore-owner@example.edu",
    name: "Restore owner",
  };
  const ctx = { user, requestId: randomUUID() };
  let assignmentId: string;
  try {
    await runtime.db.insert(t.users).values(user);
    const service = new PairEvalService(
      runtime.db,
      [user.email],
      "synthetic-export-secret",
    );
    const room = await service.createClassroom(ctx, {
      name: "Restore drill",
      slug: "restore",
      domains: ["example.edu"],
    });
    const rows = Array.from(
      { length: 12 },
      (_, i) =>
        `restore-${i}@example.edu,Group ${Math.floor(i / 4)},Student ${i}`,
    );
    await service.importRoster(
      ctx,
      room.id,
      `email,group_name,display_name\n${rows.join("\n")}`,
    );
    const roster = await service.roster(ctx, room.id);
    for (const g of roster.groups)
      await service.updateArtifact(ctx, room.id, g.id, {
        artifactUrl: "https://example.edu/work",
      });
    const assignment = await service.createAssignment(ctx, {
      classroomId: room.id,
      name: "Final",
      opensAt: new Date(Date.now() - 60000).toISOString(),
      closesAt: new Date(Date.now() + 3600000).toISOString(),
      config: {},
      criteria: [
        { id: "g", side: "GROUP", name: "Quality", weightPct: 100 },
        { id: "i", side: "INDIVIDUAL", name: "Teamwork", weightPct: 100 },
      ],
    });
    assignmentId = assignment.id;
    await service.publish(ctx, assignment.id, { acceptReducedCoverage: true });
    const student = roster.members.find((m) => m.role === "STUDENT")!;
    const studentCtx = { user: student, requestId: randomUUID() };
    const evaluation = await service.evaluations(
      studentCtx,
      assignment.id,
      "GROUP",
    );
    await service.save(studentCtx, evaluation.comparisons[0].pairAssignmentId, {
      choice: 2,
      expectedVersion: 0,
    });
    await service.submit(
      studentCtx,
      assignment.id,
      { side: "GROUP" },
      "restore-submit",
    );
    await service.close(ctx, assignment.id, { reason: "Restore drill" });
    await service.finalize(ctx, assignment.id, {
      reason: "Synthetic acceptance fixture",
    });
    await assert.rejects(
      runtime.client`update audit.events set action='TAMPERED'`,
    );
    await assert.rejects(runtime.client`delete from scores`);
    await assert.rejects(runtime.client`drop table answers`);
    console.log(
      "PASS: restricted runtime can complete lifecycle, but cannot mutate audit, delete scores or drop tables",
    );
  } finally {
    await runtime.client.end();
  }
  const fixtureDir = resolve("backups", `drill-${randomUUID()}`);
  await mkdir(fixtureDir, { recursive: true });
  const file = resolve(fixtureDir, "synthetic.enc");
  await run("scripts/backup.ts", ["backup", file], {
    MIGRATION_DATABASE_URL: url,
    BACKUP_KEY: key,
  });
  await client.unsafe("CREATE DATABASE paireval_restore_test");
  const restoreUrl = new URL(url);
  restoreUrl.pathname = "/paireval_restore_test";
  const target = connectDatabase(restoreUrl.toString());
  try {
    // Managed Supabase schemas are deliberately outside the app backup/empty check.
    await target.client`create schema managed_service`;
    await target.client`create table managed_service.keep_me (id integer)`;
    const env = {
      RESTORE_DATABASE_URL: restoreUrl.toString(),
      BACKUP_KEY: key,
      CONFIRM_RESTORE: "EMPTY_DATABASE",
    };
    const tampered = await readFile(file);
    tampered[30] ^= 1;
    const corrupt = resolve(fixtureDir, "tampered.enc");
    await writeFile(corrupt, tampered);
    await run("scripts/backup.ts", ["restore", corrupt], env, false);
    const empty =
      await target.client`select 1 from information_schema.tables where table_schema in ('public','audit','drizzle')`;
    assert.equal(empty.length, 0);
    await run("scripts/backup.ts", ["restore", file], env);
    for (const table of [
      "users",
      "classrooms",
      "members",
      "groups",
      "assignments",
      "pairs",
      "answers",
      "revisions",
      "submissions",
      "scores",
      "overrides",
      "audit.events",
    ]) {
      const before = await client.unsafe(`select count(*) as n from ${table}`);
      const after = await target.client.unsafe(
        `select count(*) as n from ${table}`,
      );
      assert.equal(after[0].n, before[0].n, table);
    }
    const before =
      await client`select snapshot from assignments where id=${assignmentId}`;
    const after =
      await target.client`select snapshot from assignments where id=${assignmentId}`;
    assert.deepEqual(after[0].snapshot, before[0].snapshot);
    await assert.rejects(
      target.client`update audit.events set action='TAMPERED'`,
    );
    await run("scripts/backup.ts", ["restore", file], env, false);
    await run("scripts/provision-runtime.ts", [], {
      MIGRATION_DATABASE_URL: restoreUrl.toString(),
      APP_DATABASE_PASSWORD: password,
    });
    console.log(
      "PASS: encrypted restore preserves all 12 table counts, final snapshot and immutable triggers; corrupt backups and nonempty targets rejected",
    );
  } finally {
    await target.client.end();
  }
} finally {
  await client.end();
}
