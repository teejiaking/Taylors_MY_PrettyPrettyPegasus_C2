import { readdirSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

// Supabase SQL is the source of truth; Prisma tracks the same forward-only
// scripts in its own migration history when using the database connection.
export function prepareHostedMigrations() {
  const root = "prisma/postgres/migrations";
  mkdirSync(root, { recursive: true });
  writeFileSync(
    path.join(root, "migration_lock.toml"),
    'provider = "postgresql"\n',
  );
  for (const file of readdirSync("supabase/migrations")
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    const target = path.join(root, file.slice(0, -4));
    mkdirSync(target, { recursive: true });
    writeFileSync(
      path.join(target, "migration.sql"),
      readFileSync(path.join("supabase/migrations", file)),
    );
  }
}
