import { spawnSync } from "node:child_process";
import path from "node:path";

function run(script, args = []) {
  const result = spawnSync(process.execPath, [path.resolve(script), ...args], {
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// Preview builds never migrate a shared production database.
if (process.env.VERCEL === "1" && process.env.VERCEL_ENV === "production") {
  run("scripts/migrate-hosted.mjs");
  run("scripts/verify-hosted.mjs");
}
run("node_modules/next/dist/bin/next", ["build", "--webpack"]);
