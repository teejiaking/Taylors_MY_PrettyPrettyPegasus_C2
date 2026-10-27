import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
const source = readFileSync("prisma/schema.prisma", "utf8");
const hosted = source
  .replace(
    'provider = "prisma-client-js"',
    'provider = "prisma-client-js"\n  output = "../../node_modules/@prisma/trustvault-postgres"',
  )
  .replace('provider = "sqlite"', 'provider = "postgresql"')
  .replace(
    'url = env("DATABASE_URL")',
    'url = env("POSTGRES_DATABASE_URL")\n  schemas = ["trustvault"]',
  )
  .replace(/(@@map\("[^"]+"\))/g, '$1\n  @@schema("trustvault")');
mkdirSync("prisma/postgres", { recursive: true });
writeFileSync(
  "prisma/postgres/schema.prisma",
  "// Generated from ../schema.prisma by scripts/generate.mjs.\n" + hosted,
);
for (const schema of [
  "prisma/schema.prisma",
  "prisma/postgres/schema.prisma",
]) {
  const result = spawnSync(
    process.execPath,
    [
      path.resolve("node_modules/prisma/build/index.js"),
      "generate",
      "--schema",
      schema,
    ],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        DATABASE_URL: "file:./trustvault.db",
        POSTGRES_DATABASE_URL:
          "postgresql://build:build@127.0.0.1:5432/trustvault?schema=trustvault",
      },
    },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}
