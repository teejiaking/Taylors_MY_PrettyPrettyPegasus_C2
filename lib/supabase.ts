import {
  createServerClient,
  parseCookieHeader,
  type CookieOptions,
} from "@supabase/ssr";
import type {
  SupabaseClient,
  User as SupabaseUser,
} from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { db, isUniqueViolation } from "./db";
import { AppError } from "./storage";

export function supabaseConfigured() {
  const url = process.env.SUPABASE_URL,
    key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || key.startsWith("sb_secret_")) return false;
  try {
    const parsed = new URL(url);
    if (
      parsed.protocol !== "https:" &&
      !["127.0.0.1", "localhost"].includes(parsed.hostname)
    )
      return false;
  } catch {
    return false;
  }
  // Legacy anon keys are allowed, service-role JWTs are not.
  if (key.split(".").length === 3) {
    try {
      if (
        JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString())
          .role !== "anon"
      )
        return false;
    } catch {
      return false;
    }
  }
  return true;
}

export function createSupabaseContext(req: Request, fetcher?: typeof fetch) {
  if (!supabaseConfigured())
    throw new AppError(
      503,
      "Configure SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY on the server to enable real sign-in.",
    );
  const incoming = parseCookieHeader(req.headers.get("cookie") || "");
  const jar = new Map(incoming.map((c) => [c.name, c.value ?? ""]));
  const changes = new Map<
    string,
    { name: string; value: string; options: CookieOptions }
  >();
  const secure = (process.env.APP_ORIGIN || "").startsWith("https:");
  if (
    process.env.NODE_ENV === "production" &&
    !secure &&
    !/^http:\/\/127\.0\.0\.1:\d+$/.test(process.env.APP_ORIGIN || "")
  )
    throw new AppError(
      503,
      "HTTPS is required for deployed Supabase authentication.",
    );
  const client = createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieOptions: { httpOnly: true, secure, sameSite: "lax", path: "/" },
      global: fetcher ? { fetch: fetcher } : undefined,
      cookies: {
        getAll: () => Array.from(jar, ([name, value]) => ({ name, value })),
        setAll(cookies) {
          for (const c of cookies) {
            jar.set(c.name, c.value);
            changes.set(c.name, c);
          }
        },
      },
    },
  );
  return {
    client,
    apply(response: NextResponse) {
      for (const { name, value, options } of changes.values())
        response.cookies.set(name, value, {
          ...options,
          httpOnly: true,
          secure,
          sameSite: "lax",
          path: "/",
        });
      response.headers.set("Cache-Control", "no-store, private, max-age=0");
      response.headers.set("Pragma", "no-cache");
      return response;
    },
  };
}

/** Only call with a user returned by the configured Auth server's getUser(). */
export async function resolveSupabaseUser(verified: SupabaseUser) {
  if (verified.is_anonymous || !verified.email || !verified.email_confirmed_at)
    throw new AppError(403, "Confirm your email before opening TrustVault.");
  const subject = `supabase:${verified.id}`;
  const existing = await db.user.findUnique({ where: { subject } });
  if (existing) {
    if (existing.demo)
      throw new AppError(
        403,
        "Demo identities cannot be used for real sign-in.",
      );
    return existing;
  }
  const name =
    typeof verified.user_metadata?.display_name === "string"
      ? verified.user_metadata.display_name.trim().slice(0, 100)
      : verified.email.split("@")[0];
  try {
    // No role or organisation is ever copied from editable user_metadata.
    return await db.user.create({
      data: {
        subject,
        email: verified.email,
        name: name || "Student",
        role: "STUDENT",
        demo: false,
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const raced = await db.user.findUnique({ where: { subject } });
      if (raced && !raced.demo) return raced;
      throw new AppError(
        403,
        "This email is linked to a different identity. Ask the project operator to review the account mapping.",
      );
    }
    throw error;
  }
}

export async function authenticateSupabase(
  req: Request,
  client?: SupabaseClient,
) {
  const auth = client ?? createSupabaseContext(req).client;
  const bearer = req.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  // Network verification, not trust in cookie contents or getSession().user.
  const { data, error } = await auth.auth.getUser(bearer);
  if (error || !data.user)
    throw new AppError(
      error && error.status && error.status >= 500 ? 503 : 401,
      error && error.status && error.status >= 500
        ? "Supabase Auth is temporarily unavailable."
        : "Sign in with your verified Supabase account.",
    );
  return resolveSupabaseUser(data.user);
}

export async function supabaseCredentials(
  client: SupabaseClient,
  input: { email: string; password: string; name?: string },
  signup: boolean,
) {
  if (signup) {
    const { data, error } = await client.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        data: { display_name: input.name },
        emailRedirectTo:
          (process.env.APP_ORIGIN || "http://127.0.0.1:3000") +
          "/auth/callback",
      },
    });
    if (error)
      throw new AppError(
        error.status && error.status >= 500 ? 503 : 400,
        "Account creation could not be completed. Check the project email provider, password requirements and sign-up settings.",
      );
    return {
      confirmationRequired: !data.session,
      message:
        "Check your inbox to confirm your email, then sign in. New accounts receive the Student role.",
    };
  }
  const { error } = await client.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  });
  if (error)
    throw new AppError(
      error.status && error.status >= 500 ? 503 : 401,
      "Sign-in failed. Check your email, password and email confirmation.",
    );
  await authenticateSupabase(
    new Request(process.env.APP_ORIGIN || "http://127.0.0.1:3000"),
    client,
  );
  return { ok: true };
}
