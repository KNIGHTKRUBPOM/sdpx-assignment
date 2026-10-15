import { migrate } from "drizzle-orm/postgres-js/migrator";
import { connectDatabase } from "../src/db/client";
const url = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
if (!url)
  throw new Error(
    "Set MIGRATION_DATABASE_URL (or DATABASE_URL for local development)",
  );
const { db, client } = connectDatabase(url);
try {
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Database migrations complete.");
} finally {
  await client.end();
}
