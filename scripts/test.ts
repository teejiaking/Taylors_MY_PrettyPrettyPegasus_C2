import "dotenv/config";
import { spawnSync } from "node:child_process";
import path from "node:path";
const env: NodeJS.ProcessEnv = {
  ...process.env,
  NODE_ENV: "test",
  AUTH_MODE: "demo",
  DATABASE_URL: "file:./trustvault-test.db",
  DATABASE_BACKEND: "sqlite",
  STORAGE_BACKEND: "local",
  STORAGE_DIR: "./test-results/storage",
};
const migration = spawnSync(
  process.execPath,
  ["--import", "tsx", "scripts/migrate.ts"],
  { env, stdio: "inherit" },
);
if (migration.status !== 0) process.exit(migration.status ?? 1);
const tests = spawnSync(
  process.execPath,
  [
    "--import",
    "tsx",
    "--test",
    "--test-concurrency=1",
    "tests/security.test.ts",
  ],
  { env, stdio: "inherit" },
);
process.exit(tests.status ?? 1);
