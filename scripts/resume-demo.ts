import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { demoAccounts, demoEnabled } from "../src/demo/config";
import { assertDemoPortAvailable } from "./demo-port";

let child: ChildProcess | undefined;
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => { child?.kill(); process.exit(signal === "SIGINT" ? 130 : 143); });
try {
  if (process.env.VERCEL || process.env.VERCEL_ENV || process.env.VERCEL_URL) throw new Error("Resume Demo ใช้ได้เฉพาะเครื่อง local");
  await assertDemoPortAvailable();
  const docker = (args: string[]) => {
    const result = spawnSync("docker", args, { encoding: "utf8", windowsHide: true });
    if (result.status !== 0) throw new Error("Docker ไม่พร้อม เปิด Docker Desktop แล้วลองใหม่");
    return result.stdout.trim();
  };
  const names = docker(["ps", "--format", "{{.Names}}"])
    .split("\n").filter(name => /^paireval-demo-[a-f0-9]{10}$/.test(name));
  const specified = process.argv.indexOf("--container");
  const name = specified < 0 && names.length === 1 ? names[0] : process.argv[specified + 1];
  if (!names.includes(name)) throw new Error(names.length ? "พบ Demo หลายรอบ ใช้ npm run demo:resume -- --container ตามด้วยชื่อจาก docker ps" : "ไม่มีฐานข้อมูล Demo รอบเดิม เปิดรอบใหม่ด้วย npm run demo");
  const [container] = JSON.parse(docker(["inspect", name]));
  const variables = Object.fromEntries((container.Config.Env as string[]).map(value => { const i = value.indexOf("="); return [value.slice(0, i), value.slice(i + 1)]; }));
  const bindings = container.NetworkSettings.Ports["5432/tcp"];
  if (!container.State.Running || container.Config.Image !== "postgres:17.6-alpine" || variables.POSTGRES_DB !== "paireval_demo" ||
      !variables.POSTGRES_PASSWORD || bindings?.length !== 1 || bindings[0].HostIp !== "127.0.0.1" ||
      !("/var/lib/postgresql/data" in (container.HostConfig.Tmpfs ?? {}))) throw new Error("ปฏิเสธฐานข้อมูลที่ไม่ใช่ Demo ชั่วคราวบนเครื่องนี้");
  const url = `postgresql://postgres:${encodeURIComponent(variables.POSTGRES_PASSWORD)}@127.0.0.1:${bindings[0].HostPort}/paireval_demo`;
  const env = { ...process.env, DEMO_MODE: "true", DATABASE_URL: url, MIGRATION_DATABASE_URL: url,
    NEXTAUTH_URL: "http://localhost:3101", NEXTAUTH_SECRET: randomBytes(32).toString("hex"),
    INITIAL_OWNER_EMAILS: demoAccounts[0].email, GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "" };
  demoEnabled(env);
  for (const args of [
    ["--import", "tsx", "scripts/migrate.ts"],
    ["node_modules/next/dist/bin/next", "build", "--webpack"],
    ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3101"],
  ]) {
    if (args.includes("start")) console.log("Demo รอบเดิม: http://localhost:3101/login — เลือกบัญชีใหม่ ข้อมูลประเมินยังอยู่ครบ");
    const code = await new Promise<number>((resolve, reject) => {
      child = spawn(process.execPath, args, { env, stdio: "inherit", windowsHide: true });
      child.once("error", reject); child.once("exit", code => resolve(code ?? 1));
    });
    if (code) throw new Error("เปิด Demo ไม่สำเร็จ ตรวจข้อความด้านบน ฐานข้อมูลรอบเดิมยังคงอยู่");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "เปิด Demo รอบเดิมไม่สำเร็จ");
  process.exitCode = 1;
}
