import { SignJWT, jwtVerify } from "jose";
import { db } from "./db";
import { AppError } from "./storage";
import type { User } from "@prisma/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authenticateSupabase } from "./supabase";
export const sessionCookie = "tv_session";
export function tidecloakLoginConfigured() {
  try {
    const config = JSON.parse(process.env.TIDECLOAK_CONFIG_JSON || "{}");
    const issuer = process.env.TIDECLOAK_ISSUER;
    const client = process.env.TIDECLOAK_CLIENT_ID;
    if (
      !issuer ||
      !client ||
      !process.env.TIDECLOAK_CLIENT_SECRET ||
      !process.env.SESSION_SECRET ||
      process.env.SESSION_SECRET.length < 32 ||
      typeof config.realm !== "string" ||
      !config.realm ||
      typeof config["auth-server-url"] !== "string" ||
      config.resource !== client
    )
      return false;
    const server = config["auth-server-url"].replace(/\/$/, "");
    const parsed = new URL(issuer);
    return (
      issuer === `${server}/realms/${config.realm}` &&
      (parsed.protocol === "https:" ||
        (process.env.NODE_ENV !== "production" && parsed.protocol === "http:"))
    );
  } catch {
    return false;
  }
}
export function isDemo() {
  if (process.env.AUTH_MODE !== "demo") return false;
  if (process.env.NODE_ENV !== "production") return true;
  return (
    process.env.TRUSTVAULT_LOOPBACK_DEMO === "1" &&
    /^http:\/\/127\.0\.0\.1:\d+$/.test(process.env.APP_ORIGIN || "")
  );
}
function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32)
    throw new Error("SESSION_SECRET must have at least 32 characters.");
  return new TextEncoder().encode(value);
}
export async function makeDemoSession(userId: string) {
  if (!isDemo())
    throw new AppError(403, "Local demo authentication is disabled.");
  const user = await db.user.findFirst({ where: { id: userId, demo: true } });
  if (!user) throw new AppError(401, "Unknown demo identity.");
  return new SignJWT({ mode: "demo" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuer("trustvault-demo")
    .setAudience("trustvault")
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(secret());
}
export function getCookie(req: Request, name: string) {
  return req.headers
    .get("cookie")
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(name + "="))
    ?.slice(name.length + 1);
}
export async function verifyTideToken(token: string) {
  if (process.env.AUTH_MODE !== "tidecloak")
    throw new AppError(401, "TideCloak authentication is not enabled.");
  const config = JSON.parse(process.env.TIDECLOAK_CONFIG_JSON || "{}");
  const issuer = process.env.TIDECLOAK_ISSUER,
    client = process.env.TIDECLOAK_CLIENT_ID;
  if (
    !config.realm ||
    !config["auth-server-url"] ||
    !config.resource ||
    !issuer ||
    !client ||
    config.resource !== client
  )
    throw new Error("Complete TideCloak server configuration first.");
  const { verifyTideCloakToken } = await import("@tidecloak/nextjs/server");
  const claims = await verifyTideCloakToken(config, token, [
    "student",
    "recipient",
    "administrator",
  ]);
  if (
    !claims ||
    claims.iss !== issuer ||
    claims.azp !== client ||
    typeof claims.sub !== "string" ||
    typeof claims.exp !== "number" ||
    claims.exp * 1000 <= Date.now()
  )
    throw new AppError(401, "Invalid or expired TideCloak access token.");
  const roles: string[] = [
    ...(claims.realm_access?.roles ?? []),
    ...(claims.resource_access?.[client]?.roles ?? []),
  ];
  const user = await db.user.findUnique({ where: { subject: claims.sub } });
  if (!user || user.demo || !roles.includes(user.role.toLowerCase()))
    throw new AppError(
      403,
      "Account must be provisioned with a matching TideCloak role.",
    );
  return { user, claims };
}
export async function authenticate(
  req: Request,
  supabase?: SupabaseClient,
): Promise<User> {
  if (process.env.AUTH_MODE === "supabase")
    return authenticateSupabase(req, supabase);
  if (isDemo()) {
    const token = getCookie(req, sessionCookie);
    if (!token) throw new AppError(401, "Sign in to continue.");
    try {
      const { payload } = await jwtVerify(token, secret(), {
        algorithms: ["HS256"],
        issuer: "trustvault-demo",
        audience: "trustvault",
      });
      if (payload.mode !== "demo") throw new Error();
      const user = await db.user.findFirst({
        where: { id: payload.sub, demo: true },
      });
      if (user) return user;
    } catch {}
    throw new AppError(401, "Your demo session has expired. Sign in again.");
  }
  if (process.env.AUTH_MODE !== "tidecloak")
    throw new AppError(
      401,
      "Authentication is not configured. Demo mode is disabled in production.",
    );
  const token =
    req.headers.get("authorization")?.replace(/^Bearer /, "") ||
    getCookie(req, "tv_tide");
  if (!token) throw new AppError(401, "Sign in with TideCloak.");
  return (await verifyTideToken(token)).user;
}
export function requireRole(user: User, ...roles: string[]) {
  if (!roles.includes(user.role))
    throw new AppError(403, "Your role does not permit this action.");
}
export function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (
    !origin ||
    origin !== new URL(process.env.APP_ORIGIN || "http://127.0.0.1:3000").origin
  )
    throw new AppError(403, "Request origin is not permitted.");
}
