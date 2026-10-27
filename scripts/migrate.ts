import nextEnv from "@next/env";
const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
// Prisma 6's Windows engine needs the SQLite file to exist on this host.
const url = process.env.DATABASE_URL || "file:./trustvault.db";
if (!url.startsWith("file:"))
  throw new Error("This local prototype requires a file: SQLite DATABASE_URL.");
const filename = path.resolve("prisma", url.slice(5));
mkdirSync(path.dirname(filename), { recursive: true });
new DatabaseSync(filename).close();
const result = spawnSync(
  process.execPath,
  [path.resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"],
  { stdio: "inherit", env: process.env },
);
process.exit(result.status ?? 1);
