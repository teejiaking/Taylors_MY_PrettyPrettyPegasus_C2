import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { parse } from "dotenv";

const command = process.argv[2] || "prepare";
mkdirSync(".tidecloak", { recursive: true });
const secretFile = ".tidecloak/local.env";
if (!existsSync(secretFile))
  writeFileSync(
    secretFile,
    `TIDECLOAK_BOOTSTRAP_PASSWORD=${randomBytes(32).toString("hex")}\n`,
    { mode: 0o600 },
  );
const envFile = ".env.local";
const previous = existsSync(envFile) ? readFileSync(envFile, "utf8") : "";
const configured = parse(previous);
const defaults = {
  WORKSPACE_MODE: "tidecloak",
  AUTH_MODE: "tidecloak",
  APP_ORIGIN: "http://127.0.0.1:3000",
  DATABASE_BACKEND: "sqlite",
  DATABASE_URL: "file:./trustvault-tidecloak.db",
  STORAGE_BACKEND: "local",
  STORAGE_DIR: "./private-storage-tidecloak",
  SESSION_SECRET: randomBytes(48).toString("hex"),
  DOCUMENT_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
  TIDECLOAK_ISSUER: "http://localhost:8080/realms/trustvault",
  TIDECLOAK_CLIENT_ID: "trustvault",
  TIDECLOAK_CLIENT_SECRET: "",
  TIDECLOAK_CONFIG_JSON: "",
};
const additions = Object.entries(defaults).filter(
  ([name]) => !(name in configured),
);
if (additions.length)
  writeFileSync(
    envFile,
    previous +
      "\n# TideCloak local integration; existing values above were preserved.\n" +
      additions
        .map(([name, value]) => `${name}=${JSON.stringify(value)}`)
        .join("\n") +
      "\n",
    { mode: 0o600 },
  );
console.log(
  "Local settings prepared in ignored .env.local. Existing values were preserved.",
);
console.log(
  "Docker bootstrap credentials are in ignored .tidecloak/local.env; they are never printed or committed.",
);
if (command === "prepare") {
  console.log(
    "After enabling VirtualMachinePlatform and restarting Windows, start Docker Desktop and run npm run tidecloak:start.",
  );
} else if (["start", "status", "stop"].includes(command)) {
  const args = [
    "compose",
    "--env-file",
    secretFile,
    "-f",
    "compose.tidecloak.yaml",
    ...(command === "start"
      ? ["up", "-d"]
      : command === "status"
        ? ["ps"]
        : ["stop"]),
  ];
  const result = spawnSync("docker", args, { stdio: "inherit" });
  if (result.status !== 0) {
    console.error(
      "Docker Desktop's Linux engine must be running. On Windows, VirtualMachinePlatform must be enabled and Windows restarted.",
    );
    process.exit(result.status ?? 1);
  }
  if (command === "start")
    console.log(
      "Open http://localhost:8080 and complete the realm/Tide enrollment steps in TIDECLOAK.md.",
    );
} else
  throw new Error(
    "Use prepare, start, status or stop. No command deletes Docker volumes.",
  );
