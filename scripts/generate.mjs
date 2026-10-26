import { spawnSync } from "node:child_process";
import path from "node:path";
// Only generates the optional local Prisma client. Never connects or migrates.
const result = spawnSync(
  process.execPath,
  [
    path.resolve("node_modules/prisma/build/index.js"),
    "generate",
    "--schema",
    "prisma/schema.prisma",
  ],
  {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: "file:./trustvault.db" },
  },
);
process.exit(result.status ?? 1);
