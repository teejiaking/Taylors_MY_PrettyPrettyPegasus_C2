import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
if (!existsSync(".env")) {
  const env = readFileSync(".env.example", "utf8")
    .replace(
      'SESSION_SECRET=""',
      'SESSION_SECRET="' + randomBytes(48).toString("hex") + '"',
    )
    .replace(
      'DOCUMENT_ENCRYPTION_KEY=""',
      'DOCUMENT_ENCRYPTION_KEY="' + randomBytes(32).toString("hex") + '"',
    );
  writeFileSync(".env", env, { mode: 0o600 });
  console.log(
    "Created local .env for the optional TideCloak server. The browser demo needs no settings.",
  );
} else console.log("Existing .env preserved.");
