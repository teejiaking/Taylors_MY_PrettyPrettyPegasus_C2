import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { z } from "zod";
import {
  createSupabaseContext,
  supabaseConfigured,
  supabaseCredentials,
} from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import { db } from "@/lib/db";
import {
  authenticate,
  assertSameOrigin,
  isDemo,
  makeDemoSession,
  sessionCookie,
  tidecloakLoginConfigured,
} from "@/lib/auth";
import { AppError } from "@/lib/storage";
import * as service from "@/lib/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store, private, max-age=0",
      Pragma: "no-cache",
      Vary: "Cookie, Authorization",
    },
  });
}
async function dispatch(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
  supabase?: SupabaseClient,
) {
  const { path } = await params;
  const route = path.join("/");
  try {
    if (req.method === "POST") assertSameOrigin(req);
    if (route === "session" && req.method === "GET") {
      let user = null;
      try {
        if (process.env.AUTH_MODE !== "supabase" || supabase)
          user = await authenticate(req, supabase);
      } catch (e) {
        if (!(e instanceof AppError)) throw e;
      }
      const identities = isDemo()
        ? await db.user.findMany({
            where: { demo: true },
            select: {
              id: true,
              name: true,
              role: true,
              organisation: true,
              email: true,
            },
          })
        : [];
      return json({
        user: user
          ? {
              id: user.id,
              name: user.name,
              role: user.role,
              email: user.email,
              organisation: user.organisation,
            }
          : null,
        demo: isDemo(),
        authMode: process.env.AUTH_MODE || "unconfigured",
        configured:
          isDemo() ||
          (process.env.AUTH_MODE === "supabase" && supabaseConfigured()) ||
          (process.env.AUTH_MODE === "tidecloak" && tidecloakLoginConfigured()),
        identities,
      });
    }
    if (route.startsWith("auth/supabase/") && req.method === "POST") {
      if (process.env.AUTH_MODE !== "supabase")
        throw new AppError(403, "Supabase authentication is not enabled.");
      if (!supabase)
        throw new AppError(
          503,
          "Configure SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY to enable real sign-in.",
        );
      if (!["auth/supabase/login", "auth/supabase/signup"].includes(route))
        throw new AppError(404, "Unknown sign-in action.");
      if (Number(req.headers.get("content-length")) > 16384)
        throw new AppError(413, "Authentication request is too large.");
      const signup = route.endsWith("/signup");
      const credentials = z
        .object({
          email: z.email().max(254),
          password: z
            .string()
            .min(signup ? 6 : 1)
            .max(256),
          name: z.string().trim().min(2).max(100).optional(),
        })
        .parse(await req.json());
      return json(await supabaseCredentials(supabase, credentials, signup));
    }
    if (route === "demo/login" && req.method === "POST") {
      if (!isDemo())
        throw new AppError(403, "Local demo authentication is disabled.");
      const { userId } = await req.json();
      if (typeof userId !== "string")
        throw new AppError(400, "Select a demo identity.");
      const token = await makeDemoSession(userId);
      const res = json({ ok: true });
      res.cookies.set(sessionCookie, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: false,
        path: "/",
        maxAge: 8 * 3600,
      });
      return res;
    }
    if (route === "logout" && req.method === "POST") {
      if (supabase) {
        const { error } = await supabase.auth.signOut({ scope: "local" });
        if (error)
          throw new AppError(
            503,
            "Supabase sign-out could not complete. Try again.",
          );
      }
      const res = json({ ok: true });
      res.cookies.delete(sessionCookie);
      res.cookies.delete("tv_tide");
      return res;
    }
    const user = await authenticate(req, supabase);
    if (route === "documents/samples" && req.method === "POST")
      return json(await service.addSamples(user), 201);
    if (route === "overview" && req.method === "GET")
      return json(await service.overview(user));
    if (route === "documents" && req.method === "POST") {
      if (Number(req.headers.get("content-length")) > 6 * 1024 * 1024)
        throw new AppError(413, "Upload too large.");
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) throw new AppError(400, "Choose a file.");
      return json(
        await service.upload(
          user,
          file,
          String(form.get("title") || ""),
          String(form.get("kind") || ""),
        ),
        201,
      );
    }
    if (
      path[0] === "documents" &&
      path.length === 3 &&
      path[2] === "preview" &&
      req.method === "GET"
    ) {
      const { bytes, mime } = await service.preview(user, path[1]);
      return new NextResponse(new Uint8Array(bytes), {
        headers: {
          "Content-Type": mime,
          "Content-Disposition": 'inline; filename="synthetic-document"',
          "Cache-Control": "no-store, private, max-age=0",
          Pragma: "no-cache",
          Vary: "Cookie, Authorization",
          "Content-Security-Policy": "sandbox; default-src 'none'",
        },
      });
    }
    if (route === "requests" && req.method === "POST")
      return json(await service.createRequest(user, await req.json()), 201);
    if (
      path[0] === "requests" &&
      path.length === 3 &&
      path[2] === "decide" &&
      req.method === "POST"
    )
      return json(await service.decideRequest(user, path[1], await req.json()));
    if (
      path[0] === "grants" &&
      path.length === 3 &&
      path[2] === "access" &&
      req.method === "GET"
    )
      return json(await service.accessGrant(user, path[1]));
    if (
      path[0] === "grants" &&
      path.length === 3 &&
      path[2] === "revoke" &&
      req.method === "POST"
    )
      return json(await service.revoke(user, path[1]));
    if (route === "proposals" && req.method === "POST")
      return json(await service.proposePolicy(user, await req.json()), 201);
    if (
      path[0] === "proposals" &&
      path.length === 3 &&
      path[2] === "review" &&
      req.method === "POST"
    )
      return json(await service.reviewPolicy(user, path[1], await req.json()));
    throw new AppError(404, "Endpoint unavailable.");
  } catch (e) {
    if (e instanceof AppError) {
      if (e.status === 401 && path[0] === "grants" && path[2] === "access")
        await service.event(
          null,
          null,
          "GRANT_ACCESS",
          "DENIED",
          path[1] ?? null,
          "Unauthenticated grant access denied.",
        );
      return json({ error: e.message }, e.status);
    }
    if (e instanceof ZodError)
      return json(
        {
          error: e.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        },
        400,
      );
    if (e instanceof SyntaxError)
      return json({ error: "Invalid request format." }, 400);
    console.error(
      "TrustVault request failed:",
      e instanceof Error ? e.name : "UnknownError",
    );
    return json(
      {
        error:
          "The operation could not be completed. Check server configuration or try again.",
      },
      500,
    );
  }
}
async function handler(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  try {
    const context =
      process.env.AUTH_MODE === "supabase" && supabaseConfigured()
        ? createSupabaseContext(req)
        : null;
    const res = await dispatch(req, ctx, context?.client);
    return context ? context.apply(res) : res;
  } catch (error) {
    return json(
      {
        error:
          error instanceof AppError
            ? error.message
            : "Authentication service is unavailable.",
      },
      error instanceof AppError ? error.status : 503,
    );
  }
}
export const GET = handler;
export const POST = handler;
