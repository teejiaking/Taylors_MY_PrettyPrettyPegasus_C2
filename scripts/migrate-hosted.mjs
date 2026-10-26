import "dotenv/config";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { prepareHostedMigrations } from "./hosted-schema.mjs";

const configured =
  process.env.SUPABASE_MIGRATION_DATABASE_URL ||
  process.env.SUPABASE_DATABASE_URL;
if (!configured)
  throw new Error(
    "Set the server-only SUPABASE_DATABASE_URL before migrating.",
  );
const url = new URL(configured);
if (!["postgres:", "postgresql:"].includes(url.protocol))
  throw new Error("A PostgreSQL connection is required.");
if (url.port === "6543")
  throw new Error("Use the Session pooler on port 5432 for migrations.");
url.searchParams.set("schema", "trustvault");
if (!url.searchParams.has("sslmode"))
  url.searchParams.set("sslmode", "require");
prepareHostedMigrations();
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
    env: { ...process.env, SUPABASE_DATABASE_URL: url.toString() },
  },
);
process.exit(result.status ?? 1);
