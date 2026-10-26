// Compatibility with existing Vercel dashboard Build Command overrides.
// Builds never connect to a database or run migrations.
import { spawnSync } from "node:child_process";
import path from "node:path";
const result = spawnSync(
  process.execPath,
  [path.resolve("node_modules/next/dist/bin/next"), "build", "--webpack"],
  { stdio: "inherit", env: process.env },
);
process.exit(result.status ?? 1);
