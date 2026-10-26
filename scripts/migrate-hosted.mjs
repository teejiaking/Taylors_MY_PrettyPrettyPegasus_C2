import "dotenv/config";
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/trustvault-postgres";
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
const migrationEnv = {
  ...process.env,
  SUPABASE_DATABASE_URL: url.toString(),
  SUPABASE_MIGRATION_DATABASE_URL: url.toString(),
};
function prisma(args) {
  const result = spawnSync(
    process.execPath,
    [path.resolve("node_modules/prisma/build/index.js"), ...args],
    { stdio: "inherit", env: migrationEnv },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// A schema installed through the SQL Editor has no Prisma history. Baseline
// only the initial migration, and only after its models and guards are verified.
// Never reset an existing schema or pretend that missing tables were applied.
const db = new PrismaClient({ datasourceUrl: url.toString() });
let baselineExisting = false;
try {
  const tables =
    await db.$queryRaw`SELECT table_name::text AS name FROM information_schema.tables WHERE table_schema = 'trustvault' AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations' ORDER BY table_name`;
  const [history] =
    await db.$queryRaw`SELECT to_regclass('trustvault._prisma_migrations') IS NOT NULL AS present`;
  let historyCount = 0;
  if (history.present) {
    const [count] =
      await db.$queryRaw`SELECT count(*)::int AS count FROM trustvault._prisma_migrations`;
    historyCount = count.count;
  }
  if (historyCount === 0 && tables.length > 0) {
    const expected = [
      "access_events",
      "admin_change_requests",
      "documents",
      "policies",
      "share_grants",
      "share_requests",
      "users",
    ];
    if (
      JSON.stringify(tables.map((table) => table.name)) !==
      JSON.stringify(expected)
    )
      throw new Error(
        "Existing TrustVault tables differ from the initial schema. Refusing to reset or baseline them.",
      );
    baselineExisting = true;
  }
} finally {
  await db.$disconnect();
}
if (baselineExisting) {
  const migrations = readdirSync("supabase/migrations").filter((name) =>
    name.endsWith(".sql"),
  );
  if (
    migrations.length !== 1 ||
    !migrations[0].endsWith("_trustvault_hosted_database.sql")
  )
    throw new Error(
      "Existing database needs an operator-reviewed baseline for this migration history.",
    );
  prisma([
    "migrate",
    "diff",
    "--from-schema-datasource",
    "prisma/postgres/schema.prisma",
    "--to-schema-datamodel",
    "prisma/postgres/schema.prisma",
    "--exit-code",
  ]);
  const verification = spawnSync(
    process.execPath,
    ["scripts/verify-hosted.mjs"],
    { stdio: "inherit", env: migrationEnv },
  );
  if (verification.status !== 0) process.exit(verification.status ?? 1);
  prisma([
    "migrate",
    "resolve",
    "--applied",
    migrations[0].slice(0, -4),
    "--schema",
    "prisma/postgres/schema.prisma",
  ]);
  console.log(
    "Initialized Prisma history for the existing verified TrustVault schema. Existing data preserved.",
  );
}
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
    env: migrationEnv,
  },
);
process.exit(result.status ?? 1);
