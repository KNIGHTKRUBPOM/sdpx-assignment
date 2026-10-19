import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import { connectDatabase } from "../src/db/client";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { demoAccounts } from "../src/demo/config";
import { assertDemoPortAvailable } from "./demo-port";

if (process.env.VERCEL || process.env.VERCEL_ENV || process.env.VERCEL_URL)
  throw new Error("The demo runner is local only; it cannot run on Vercel");
const name = `paireval-demo-${randomBytes(5).toString("hex")}`;
const password = randomBytes(32).toString("hex");
let started = false, cleaned = false, child: ChildProcess | undefined;
function docker(args: string[]) {
  const result = spawnSync("docker", args, { encoding: "utf8", windowsHide: true, env: { ...process.env, POSTGRES_PASSWORD: password } });
  if (result.status !== 0) throw new Error("Docker ไม่พร้อม กรุณาเปิด Docker Desktop ให้ Engine running แล้วลองใหม่ (ไม่มีการเปลี่ยนข้อมูล production)");
  return result.stdout.trim();
}
function cleanup() {
  if (cleaned) return;
  cleaned = true;
  child?.kill();
  if (started) { try { docker(["stop", "--time", "2", name]); } catch { console.error(`Stop the demo container manually: docker stop ${name}`); } }
}
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => { cleanup(); process.exit(signal === "SIGINT" ? 130 : 143); });
try {
  await assertDemoPortAvailable();
  docker(["run", "--rm", "-d", "--name", name, "-e", "POSTGRES_PASSWORD", "-e", "POSTGRES_DB=paireval_demo", "-p", "127.0.0.1::5432", "--tmpfs", "/var/lib/postgresql/data", "postgres:17.6-alpine"]);
  started = true;
  const port = docker(["port", name, "5432/tcp"]).split(":").at(-1);
  const url = `postgresql://postgres:${password}@127.0.0.1:${port}/paireval_demo`;
  const env = { ...process.env, DEMO_MODE: "true", DATABASE_URL: url,
    NEXTAUTH_URL: "http://localhost:3101", NEXTAUTH_SECRET: randomBytes(32).toString("hex"),
    INITIAL_OWNER_EMAILS: demoAccounts[0].email, GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "" };
  const { db, client } = connectDatabase(url);
  try {
    let ready = false;
    for (let i = 0; i < 40; i++) { try { await client`select 1`; ready = true; break; } catch { await setTimeout(250); } }
    if (!ready) throw new Error("Demo PostgreSQL did not become ready");
    await migrate(db, { migrationsFolder: "./drizzle" });
  } finally { await client.end(); }
  async function run(args: string[]) {
    const code = await new Promise<number>((resolve, reject) => {
      child = spawn(process.execPath, args, { env, stdio: "inherit", windowsHide: true });
      child.once("error", reject); child.once("exit", (status) => resolve(status ?? 1));
    });
    if (code) throw new Error("Demo command failed; production data was not accessed");
  }
  await run(["--import", "tsx", "scripts/seed-demo.ts"]);
  await run(["node_modules/next/dist/bin/next", "build", "--webpack"]);
  if (process.argv.includes("--test")) {
    await run(["node_modules/@playwright/test/cli.js", "test", "--config", "playwright.demo.config.ts"]);
  } else {
    console.log("\nPairEval Demo: http://localhost:3101/login\nเลือกสลับอาจารย์และนักศึกษาได้ ข้อมูลสมมติจะหายเมื่อปิดรอบนี้ด้วย Ctrl+C\n");
    await run(["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3101"]);
  }
} catch (error) {
  console.error(error instanceof Error && error.message.startsWith("พอร์ต ") ? error.message : "Demo เริ่มไม่สำเร็จหรือถูกหยุด ตรวจข้อความด้านบน หากฐานข้อมูลรอบเดิมยังทำงานให้ใช้ npm run demo:resume");
  process.exitCode = 1;
} finally { cleanup(); }
