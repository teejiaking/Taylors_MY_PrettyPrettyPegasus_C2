import { PrismaClient, Prisma } from "@prisma/client";

// Optional local TideCloak/server integration. The hosted app uses its browser workspace.
export function isUniqueViolation(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}
const g = globalThis as unknown as { trustvaultLocalClient?: PrismaClient };
export function databaseBackend() {
  return "sqlite";
}
function client() {
  if (process.env.VERCEL === "1")
    throw new Error(
      "The hosted demo uses browser storage. The local database is unavailable on Vercel.",
    );
  if (!process.env.DATABASE_URL?.startsWith("file:"))
    throw new Error("Configure a local SQLite DATABASE_URL for server mode.");
  return (g.trustvaultLocalClient ??= new PrismaClient({
    datasourceUrl: process.env.DATABASE_URL,
  }));
}
export const db = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const current = client();
    const value = Reflect.get(current, property);
    return typeof value === "function" ? value.bind(current) : value;
  },
});
