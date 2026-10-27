import { PrismaClient, Prisma } from "@prisma/client";
import {
  PrismaClient as PostgresClient,
  Prisma as PostgresPrisma,
} from "@prisma/trustvault-postgres";

export function isUniqueViolation(error: unknown) {
  return (
    (error instanceof Prisma.PrismaClientKnownRequestError ||
      error instanceof PostgresPrisma.PrismaClientKnownRequestError) &&
    error.code === "P2002"
  );
}
export function databaseBackend(): "sqlite" | "postgresql" {
  const backend =
    process.env.DATABASE_BACKEND ||
    (process.env.POSTGRES_DATABASE_URL ||
    /^postgres(ql)?:/.test(process.env.DATABASE_URL || "")
      ? "postgresql"
      : "sqlite");
  if (backend !== "sqlite" && backend !== "postgresql")
    throw new Error("Unknown DATABASE_BACKEND.");
  return backend;
}
export function databaseConfigured() {
  try {
    const backend = databaseBackend();
    if (process.env.VERCEL === "1" && backend !== "postgresql") return false;
    const url =
      backend === "postgresql"
        ? process.env.POSTGRES_DATABASE_URL || process.env.DATABASE_URL
        : process.env.DATABASE_URL;
    return backend === "sqlite"
      ? Boolean(url?.startsWith("file:"))
      : ["postgres:", "postgresql:"].includes(new URL(url || "").protocol);
  } catch {
    return false;
  }
}
const globalDb = globalThis as unknown as {
  trustvaultClients?: Map<string, PrismaClient>;
};
const clients = (globalDb.trustvaultClients ??= new Map<
  string,
  PrismaClient
>());
export function getDb(): PrismaClient {
  const backend = databaseBackend();
  if (process.env.VERCEL === "1" && backend !== "postgresql")
    throw new Error("Vercel requires a persistent PostgreSQL database.");
  const configured =
    backend === "postgresql"
      ? process.env.POSTGRES_DATABASE_URL || process.env.DATABASE_URL
      : process.env.DATABASE_URL;
  if (!configured || !databaseConfigured())
    throw new Error("Configure the application database connection.");
  let connection = configured;
  if (backend === "postgresql") {
    const url = new URL(configured);
    url.searchParams.set("schema", "trustvault");
    if (!url.searchParams.has("connection_limit"))
      url.searchParams.set("connection_limit", "1");
    if (!url.searchParams.has("sslmode"))
      url.searchParams.set("sslmode", "require");
    connection = url.toString();
  }
  if (!clients.has(connection))
    clients.set(
      connection,
      backend === "postgresql"
        ? (new PostgresClient({
            datasourceUrl: connection,
          }) as unknown as PrismaClient)
        : new PrismaClient({ datasourceUrl: connection }),
    );
  return clients.get(connection)!;
}
