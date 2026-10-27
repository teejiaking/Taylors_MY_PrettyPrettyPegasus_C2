import nextEnv from "@next/env";
const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());
const names = [
  "AUTH_MODE",
  "APP_ORIGIN",
  "DATABASE_URL",
  "SESSION_SECRET",
  "DOCUMENT_ENCRYPTION_KEY",
  "TIDECLOAK_ISSUER",
  "TIDECLOAK_CLIENT_ID",
  "TIDECLOAK_CLIENT_SECRET",
  "TIDECLOAK_CONFIG_JSON",
];
if (process.env.DATABASE_BACKEND === "postgresql")
  names.push("POSTGRES_DATABASE_URL");
if (process.env.STORAGE_BACKEND === "vercel-blob")
  names.push("BLOB_READ_WRITE_TOKEN");
for (const name of names) {
  const available =
    (name === "DATABASE_URL" && process.env.POSTGRES_DATABASE_URL) ||
    (name === "POSTGRES_DATABASE_URL" &&
      /^postgres(ql)?:/.test(process.env.DATABASE_URL || "")) ||
    process.env[name]?.trim();
  console.log(`${name}: ${available ? "configured" : "MISSING"}`);
}
let valid = false;
try {
  const adapter = JSON.parse(process.env.TIDECLOAK_CONFIG_JSON || "{}");
  valid =
    adapter.realm &&
    adapter.resource === process.env.TIDECLOAK_CLIENT_ID &&
    process.env.TIDECLOAK_ISSUER ===
      `${String(adapter["auth-server-url"]).replace(/\/$/, "")}/realms/${adapter.realm}`;
} catch {}
console.log(
  `Adapter/client/issuer consistency: ${valid ? "OK" : "needs configuration"}`,
);
console.log(
  "Secret values are intentionally hidden. No database or storage changes were made.",
);
if (process.argv.includes("--connect") && valid) {
  try {
    const discovery = new URL(
      process.env.TIDECLOAK_ISSUER + "/.well-known/openid-configuration",
    );
    if (
      !["https:", "http:"].includes(discovery.protocol) ||
      (discovery.protocol === "http:" &&
        !["localhost", "127.0.0.1"].includes(discovery.hostname))
    )
      throw new Error("HTTPS required");
    const response = await fetch(discovery, {
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
    const configuration = await response.json();
    console.log(
      `TideCloak discovery: ${response.ok && configuration.issuer === process.env.TIDECLOAK_ISSUER ? "OK" : "FAILED"}`,
    );
  } catch {
    console.log(
      "TideCloak discovery: unavailable. Check Docker, the server URL, and your realm.",
    );
    process.exitCode = 1;
  }
}
