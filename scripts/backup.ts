import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  mkdir,
  open,
  appendFile,
  mkdtemp,
  writeFile,
  rm,
} from "node:fs/promises";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { pipeline } from "node:stream/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { connectDatabase } from "../src/db/client";

const restore = process.argv[2] === "restore";
const rawUrl = restore
  ? process.env.RESTORE_DATABASE_URL
  : process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
if (!rawUrl || !/^[a-f0-9]{64}$/i.test(process.env.BACKUP_KEY || ""))
  throw new Error(
    "Set database URL and BACKUP_KEY (32 random bytes encoded as 64 hex characters)",
  );
if (restore && process.env.CONFIRM_RESTORE !== "EMPTY_DATABASE")
  throw new Error("Restore requires CONFIRM_RESTORE=EMPTY_DATABASE");
const url = new URL(rawUrl),
  key = Buffer.from(process.env.BACKUP_KEY!, "hex"),
  magic = Buffer.from("PAIREVAL1");
const filepath = resolve(
  process.argv[3] || `backups/paireval-${Date.now()}.enc`,
);
await mkdir("backups", { recursive: true });
let existingSchemas: string[] = [];
if (restore) {
  const { client } = connectDatabase(rawUrl);
  try {
    const rows =
      await client`select 1 from information_schema.tables where table_schema in ('public','audit','drizzle') limit 1`;
    if (rows.length)
      throw new Error(
        "Restore target must have empty public, audit and drizzle schemas",
      );
    const role =
      await client`select 1 from pg_roles where rolname='paireval_app'`;
    if (!role.length)
      throw new Error(
        "Create the NOLOGIN paireval_app role on the target before restoring policies",
      );
    existingSchemas = (
      await client`select schema_name from information_schema.schemata where schema_name in ('public','audit','drizzle')`
    ).map((r) => r.schema_name as string);
  } finally {
    await client.end();
  }
}
const loopbackDatabase = ["localhost", "127.0.0.1"].includes(url.hostname);
const linuxHostNetwork = process.platform === "linux" && loopbackDatabase;
const env = {
  ...process.env,
  PGHOST: loopbackDatabase && !linuxHostNetwork
    ? "host.docker.internal"
    : url.hostname,
  PGPORT: url.port || "5432",
  PGUSER: decodeURIComponent(url.username),
  PGPASSWORD: decodeURIComponent(url.password),
  PGDATABASE: url.pathname.slice(1),
  PGSSLMODE: url.searchParams.get("sslmode") || "prefer",
};
const args = [
  "run",
  "--rm",
  "-i",
  ...(linuxHostNetwork ? ["--network", "host"] : []),
  "--add-host",
  "host.docker.internal:host-gateway",
  ...[
    "PGHOST",
    "PGPORT",
    "PGUSER",
    "PGPASSWORD",
    "PGDATABASE",
    "PGSSLMODE",
  ].flatMap((k) => ["-e", k]),
  "postgres:17.6-alpine",
  ...(restore
    ? [
        "pg_restore",
        "--exit-on-error",
        "--single-transaction",
        "--no-owner",
        "--no-privileges",
        "-d",
        env.PGDATABASE,
      ]
    : [
        "pg_dump",
        "--format=custom",
        "--no-owner",
        "--no-privileges",
        "--schema=public",
        "--schema=audit",
        "--schema=drizzle",
      ]),
];
let tocDirectory: string | undefined;
let restoreSize = 0;
let restoreHeader = Buffer.alloc(21);
let restoreTag = Buffer.alloc(16);
const decryptedInput = () => {
  const decrypt = createDecipheriv(
    "aes-256-gcm",
    key,
    restoreHeader.subarray(9),
  );
  decrypt.setAuthTag(restoreTag);
  return [
    createReadStream(filepath, { start: 21, end: restoreSize - 17 }),
    decrypt,
  ] as const;
};
if (restore) {
  const file = await open(filepath, "r");
  try {
    restoreSize = (await file.stat()).size;
    if (restoreSize < 37) throw new Error("Not a PairEval encrypted backup");
    await file.read(restoreHeader, 0, 21, 0);
    await file.read(restoreTag, 0, 16, restoreSize - 16);
  } finally {
    await file.close();
  }
  if (!restoreHeader.subarray(0, 9).equals(magic))
    throw new Error("Not a PairEval encrypted backup");
  const validate = createDecipheriv(
    "aes-256-gcm",
    key,
    restoreHeader.subarray(9),
  );
  validate.setAuthTag(restoreTag);
  for await (const chunk of createReadStream(filepath, {
    start: 21,
    end: restoreSize - 17,
  }))
    validate.update(chunk);
  validate.final();
  // Omit CREATE SCHEMA for schemas supplied by the target (not their contents).
  // This preserves Supabase's public schema, extensions and managed schemas.
  const list = spawn(
    "docker",
    ["run", "--rm", "-i", "postgres:17.6-alpine", "pg_restore", "--list"],
    { stdio: ["pipe", "pipe", "pipe"], windowsHide: true },
  );
  const listDone = once(list, "close");
  let toc = "";
  list.stdout.on("data", (chunk) => {
    toc += chunk.toString();
  });
  list.stderr.resume();
  await pipeline(...decryptedInput(), list.stdin);
  if ((await listDone)[0] !== 0)
    throw new Error("Cannot read backup catalogue");
  tocDirectory = await mkdtemp(resolve(tmpdir(), "paireval-restore-"));
  const filtered = toc
    .split("\n")
    .filter((line) => {
      const schema = line.match(/^\d+; \d+ \d+ SCHEMA - (\S+) /)?.[1];
      return !schema || !existingSchemas.includes(schema);
    })
    .join("\n");
  await writeFile(resolve(tocDirectory, "restore.list"), filtered);
  args.splice(1, 0, "-v", `${tocDirectory}:/restore-catalogue:ro`);
  args.push("--use-list=/restore-catalogue/restore.list");
}
const child = spawn("docker", args, {
  env,
  stdio: ["pipe", "pipe", "pipe"],
  windowsHide: true,
});
const completion = once(child, "close");
child.stderr.resume();
try {
  if (!restore) {
    const iv = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", key, iv),
      output = createWriteStream(filepath, { flags: "wx" });
    output.write(Buffer.concat([magic, iv]));
    child.stdin.end();
    await pipeline(child.stdout, cipher, output);
    const [code] = await completion;
    if (code !== 0)
      throw new Error("pg_dump failed; incomplete backup must not be used");
    await appendFile(filepath, cipher.getAuthTag());
    console.log(`Encrypted backup created: ${filepath}`);
  } else {
    child.stdout.resume();
    await pipeline(...decryptedInput(), child.stdin);
    const [code] = await completion;
    if (code !== 0) throw new Error("pg_restore failed");
    console.log(
      "Restore complete. Run application migrations/provisioning and smoke tests before switching traffic.",
    );
  }
} catch (error) {
  child.kill();
  throw error;
} finally {
  if (tocDirectory) await rm(tocDirectory, { recursive: true, force: true });
}
