import { NextRequest, NextResponse } from "next/server";
import { randomBytes, createHash } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { tidecloakLoginConfigured, verifyTideToken } from "@/lib/auth";
import { workspaceMode } from "@/lib/workspace-mode";
import { limitRequest } from "@/lib/rate-limit";
import { AppError } from "@/lib/errors";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ action: string }> },
) {
  if (workspaceMode() === "demo")
    return NextResponse.redirect(new URL("/", req.url));
  const { action } = await params;
  const requestOrigin = req.nextUrl.origin;
  let origin = requestOrigin;
  let failure = "callback";
  try {
    limitRequest(req, "oidc", 30);
    // A deployment must never send a failed login to the operator's localhost.
    if (process.env.APP_ORIGIN) {
      const configured = new URL(process.env.APP_ORIGIN);
      const requested = req.nextUrl;
      // NextURL normalizes loopback addresses to "localhost" internally.
      const loopback = ["localhost", "127.0.0.1", "[::1]"];
      const sameLoopback =
        loopback.includes(configured.hostname) &&
        loopback.includes(requested.hostname) &&
        configured.protocol === requested.protocol &&
        configured.port === requested.port;
      if (configured.origin !== requestOrigin && !sameLoopback) {
        failure = "origin";
        throw new Error("APP_ORIGIN does not match this website.");
      }
      origin = configured.origin;
    }
    if (process.env.AUTH_MODE !== "tidecloak" || !tidecloakLoginConfigured()) {
      failure = "configuration";
      throw new Error("TideCloak is not configured.");
    }
    const issuer = process.env.TIDECLOAK_ISSUER,
      client = process.env.TIDECLOAK_CLIENT_ID,
      clientSecret = process.env.TIDECLOAK_CLIENT_SECRET;
    if (
      !issuer ||
      !client ||
      !clientSecret ||
      !process.env.SESSION_SECRET ||
      process.env.SESSION_SECRET.length < 32
    )
      throw new Error("TideCloak server configuration is incomplete.");
    const secure = origin.startsWith("https:");
    if (
      process.env.NODE_ENV === "production" &&
      (!secure || !issuer.startsWith("https:"))
    )
      throw new Error("HTTPS is required in production.");
    const secret = new TextEncoder().encode(process.env.SESSION_SECRET),
      redirectUri = origin + "/auth/callback";
    if (action === "login") {
      const state = randomBytes(32).toString("base64url"),
        verifier = randomBytes(32).toString("base64url");
      const signed = await new SignJWT({ state, verifier })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuer("trustvault-oidc")
        .setAudience(client)
        .setIssuedAt()
        .setExpirationTime("10m")
        .sign(secret);
      const url = new URL(issuer + "/protocol/openid-connect/auth");
      url.search = new URLSearchParams({
        client_id: client,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: "openid",
        state,
        code_challenge: createHash("sha256")
          .update(verifier)
          .digest("base64url"),
        code_challenge_method: "S256",
      }).toString();
      const res = NextResponse.redirect(url);
      res.cookies.set("tv_oidc", signed, {
        httpOnly: true,
        secure,
        sameSite: "lax",
        path: "/auth",
        maxAge: 600,
      });
      res.headers.set("Cache-Control", "no-store");
      return res;
    }
    if (action !== "callback")
      return NextResponse.json(
        { error: "Unknown authentication action." },
        { status: 404 },
      );
    const saved = req.cookies.get("tv_oidc")?.value;
    if (!saved) throw new Error("Login session expired.");
    const { payload } = await jwtVerify(saved, secret, {
      algorithms: ["HS256"],
      issuer: "trustvault-oidc",
      audience: client,
    });
    const code = req.nextUrl.searchParams.get("code");
    if (
      !code ||
      req.nextUrl.searchParams.get("state") !== payload.state ||
      typeof payload.verifier !== "string"
    )
      throw new Error("Invalid login state.");
    const exchange = await fetch(issuer + "/protocol/openid-connect/token", {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: client,
        client_secret: clientSecret,
        code_verifier: payload.verifier,
      }),
    });
    if (!exchange.ok) throw new Error("Token exchange failed.");
    const tokens = await exchange.json();
    if (typeof tokens.access_token !== "string")
      throw new Error("Missing access token.");
    const { claims } = await verifyTideToken(tokens.access_token);
    const res = NextResponse.redirect(origin);
    res.cookies.set("tv_tide", tokens.access_token, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: Math.max(
        1,
        Math.min(Number(claims.exp) - Math.floor(Date.now() / 1000), 3600),
      ),
    });
    res.cookies.delete({ name: "tv_oidc", path: "/auth" });
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (error) {
    if (error instanceof AppError && error.status === 429)
      return NextResponse.json(
        { error: error.message },
        {
          status: 429,
          headers: { "Cache-Control": "no-store", "Retry-After": "60" },
        },
      );
    if (error instanceof AppError && error.status === 403) failure = "account";
    const res = NextResponse.redirect(requestOrigin + "/?authError=" + failure);
    res.cookies.delete({ name: "tv_oidc", path: "/auth" });
    res.headers.set("Cache-Control", "no-store");
    return res;
  }
}
