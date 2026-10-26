import { PrismaClient, Prisma } from "@prisma/client";
import {
  PrismaClient as HostedPrismaClient,
  Prisma as HostedPrisma,
} from "@prisma/trustvault-postgres";

export function isUniqueViolation(error: unknown) {
  return (
    (error instanceof Prisma.PrismaClientKnownRequestError ||
      error instanceof HostedPrisma.PrismaClientKnownRequestError) &&
    error.code === "P2002"
  );
}

const g = globalThis as unknown as {
  trustvaultClients?: Map<string, PrismaClient>;
};
const clients = g.trustvaultClients ?? new Map<string, PrismaClient>();
g.trustvaultClients = clients;

export function databaseBackend() {
  return (
    process.env.DATABASE_BACKEND ||
    (process.env.VERCEL === "1" ? "supabase" : "sqlite")
  );
}

function client() {
  const backend = databaseBackend();
  if (!["sqlite", "supabase"].includes(backend))
    throw new Error("Unknown DATABASE_BACKEND.");
  if (process.env.VERCEL === "1" && backend !== "supabase")
    throw new Error(
      "Vercel requires the persistent Supabase database backend.",
    );
  const url =
    backend === "supabase"
      ? process.env.SUPABASE_DATABASE_URL
      : process.env.DATABASE_URL;
  if (!url)
    throw new Error(
      `Configure ${backend === "supabase" ? "SUPABASE_DATABASE_URL" : "DATABASE_URL"}.`,
    );
  if (backend === "supabase" && !/^postgres(ql)?:\/\//.test(url))
    throw new Error(
      "The hosted database requires a PostgreSQL connection URL.",
    );
  let connection = url;
  if (backend === "supabase") {
    const parsed = new URL(url);
    parsed.searchParams.set("schema", "trustvault");
    if (!parsed.searchParams.has("connection_limit"))
      parsed.searchParams.set("connection_limit", "1");
    if (!parsed.searchParams.has("sslmode"))
      parsed.searchParams.set("sslmode", "require");
    if (parsed.port === "6543") parsed.searchParams.set("pgbouncer", "true");
    connection = parsed.toString();
  }
  if (!clients.has(backend)) {
    // Both clients are generated from the same models; the local client supplies
    // the shared TypeScript interface for the existing authorization services.
    clients.set(
      backend,
      backend === "supabase"
        ? (new HostedPrismaClient({
            datasourceUrl: connection,
          }) as unknown as PrismaClient)
        : new PrismaClient({ datasourceUrl: connection }),
    );
  }
  return clients.get(backend)!;
}

// Lazy initialization lets the public shell and build run before hosted secrets
// are injected, without silently falling back to a local file in production.
export const db = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const current = client();
    const value = Reflect.get(current, property);
    return typeof value === "function" ? value.bind(current) : value;
  },
});
