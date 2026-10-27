// Compatibility with existing Vercel dashboard Build Command overrides.
// Builds never connect to a database or run migrations.
import { spawnSync } from "node:child_process";
import path from "node:path";
for (const [file, args] of [
  ["scripts/generate.mjs", []],
  ["node_modules/next/dist/bin/next", ["build", "--webpack"]],
]) {
  const result = spawnSync(process.execPath, [path.resolve(file), ...args], {
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
