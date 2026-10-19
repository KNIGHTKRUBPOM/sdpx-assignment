import postgres from "postgres";
const url = process.env.MIGRATION_DATABASE_URL,
  password = process.env.APP_DATABASE_PASSWORD;
if (!url || !password || password.length < 24)
  throw new Error(
    "Set MIGRATION_DATABASE_URL and APP_DATABASE_PASSWORD (24+ characters) in the environment",
  );
const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
try {
  await sql.begin(async (tx) => {
    const existing =
      await tx`select 1 from pg_roles where rolname='paireval_app'`;
    const [{ statement }] =
      await tx`select format(${existing.length ? "ALTER ROLE paireval_app LOGIN PASSWORD %L" : "CREATE ROLE paireval_app LOGIN NOINHERIT PASSWORD %L"}::text,${password}::text) as statement`;
    await tx.unsafe(statement);
    await tx`grant usage on schema public, audit to paireval_app`;
    const mutable = [
      "users",
      "classrooms",
      "groups",
      "members",
      "assignments",
      "pairs",
      "answers",
    ];
    const immutable = ["revisions", "submissions", "scores", "overrides"];
    for (const table of [...mutable, ...immutable]) {
      await tx.unsafe(
        `GRANT SELECT, INSERT${mutable.includes(table) ? ", UPDATE" : ""} ON public.${table} TO paireval_app`,
      );
      await tx.unsafe(
        `DROP POLICY IF EXISTS paireval_server ON public.${table}`,
      );
      await tx.unsafe(
        `CREATE POLICY paireval_server ON public.${table} TO paireval_app USING (true) WITH CHECK (true)`,
      );
    }
    await tx`grant select, insert on audit.events to paireval_app`;
  });
  console.log(
    "Runtime role provisioned. Set DATABASE_URL to paireval_app using the hosting secret manager.",
  );
} catch {
  console.error(
    "Runtime provisioning failed. Check admin connectivity and role-management permission.",
  );
  process.exitCode = 1;
} finally {
  await sql.end();
}
