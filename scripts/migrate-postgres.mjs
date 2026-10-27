import nextEnv from "@next/env";
const { loadEnvConfig } = nextEnv;
import { spawnSync } from "node:child_process";
import path from "node:path";
loadEnvConfig(process.cwd());
const connection =
  process.env.POSTGRES_MIGRATION_URL ||
  process.env.POSTGRES_DATABASE_URL ||
  process.env.DATABASE_URL;
if (!connection)
  throw new Error("Configure POSTGRES_MIGRATION_URL or POSTGRES_DATABASE_URL.");
const url = new URL(connection);
if (!["postgres:", "postgresql:"].includes(url.protocol))
  throw new Error("Use a PostgreSQL connection for hosted migrations.");
url.searchParams.set("schema", "trustvault");
if (!url.searchParams.has("sslmode"))
  url.searchParams.set("sslmode", "require");
const result = spawnSync(
  process.execPath,
  [
    path.resolve("node_modules/prisma/build/index.js"),
    "migrate",
    "deploy",
    "--schema",
    "prisma/postgres/schema.prisma",
  ],
  {
    stdio: "inherit",
    env: { ...process.env, POSTGRES_DATABASE_URL: url.toString() },
  },
);
process.exit(result.status ?? 1);
