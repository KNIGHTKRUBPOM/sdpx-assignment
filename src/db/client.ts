import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";
import { demoEnabled } from "../demo/config";

export function connectDatabase(url: string) {
  if (process.env.DEMO_MODE === "true") demoEnabled({ ...process.env, DATABASE_URL: url });
  const client = postgres(url, {
    max: 3,
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  return { client, db: drizzle(client, { schema }) };
}
export type Database = ReturnType<typeof connectDatabase>["db"];
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
let connection: ReturnType<typeof connectDatabase> | undefined;
export function database() {
  if (!process.env.DATABASE_URL)
    throw new Error("DATABASE_URL is not configured");
  connection ??= connectDatabase(process.env.DATABASE_URL);
  return connection.db;
}
