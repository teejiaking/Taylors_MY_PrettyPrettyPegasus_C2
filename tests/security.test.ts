import "dotenv/config";
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDb } from "../lib/db";
import { seed } from "../scripts/seed";
import * as s from "../lib/service";
import { assess } from "../lib/guardian";
import {
  authenticate,
  assertSameOrigin,
  makeDemoSession,
  isDemo,
  verifyTideToken,
  tidecloakLoginConfigured,
} from "../lib/auth";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import {
  readFilePrivate,
  validateFile,
  storeFile,
  removeFile,
  AppError,
} from "../lib/storage";
import type { User } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { GET as apiGet, POST as apiPost } from "../app/api/[...path]/route";
import { GET as authGet } from "../app/auth/[action]/route";
let student: User,
  recipient: User,
  adminA: User,
  adminB: User,
  otherStudent: User,
  otherRecipient: User;
before(async () => {
  await seed();
  student = await getDb().user.findUniqueOrThrow({
    where: { id: "student-maya" },
  });
  recipient = await getDb().user.findUniqueOrThrow({
    where: { id: "recipient-campus" },
  });
  adminA = await getDb().user.findUniqueOrThrow({
    where: { id: "admin-jordan" },
  });
  adminB = await getDb().user.findUniqueOrThrow({ where: { id: "admin-sam" } });
  otherStudent = await getDb().user.create({
    data: {
      id: "test-other-student",
      subject: "demo:other",
      email: "other@students.example.test",
      name: "Other Student",
      role: "STUDENT",
      demo: true,
    },
  });
  otherRecipient = await getDb().user.create({
    data: {
      id: "test-other-recipient",
      subject: "demo:otherrecipient",
      email: "other@recipient.example.test",
      name: "Other Recipient",
      role: "RECIPIENT",
      organisation: "Other simulated organisation",
      demo: true,
    },
  });
});
after(async () => getDb().$disconnect());
const denied = (fn: () => Promise<unknown>, status: number) =>
  assert.rejects(
    fn,
    (e: unknown) => e instanceof AppError && e.status === status,
  );

async function withAuthEnv(
  values: Record<string, string | undefined>,
  work: () => Promise<void>,
) {
  const saved = Object.fromEntries(
    Object.keys(values).map((key) => [key, process.env[key]]),
  );
  try {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await work();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function providerResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
test("authentication requires a valid signed session and reads roles from the database", async () => {
  await denied(() => authenticate(new Request("http://127.0.0.1:3000")), 401);
  const token = await makeDemoSession(student.id);
  assert.equal(
    (
      await authenticate(
        new Request("http://127.0.0.1:3000", {
          headers: { cookie: "tv_session=" + token, "x-role": "ADMINISTRATOR" },
        }),
      )
    ).role,
    "STUDENT",
  );
  await denied(
    () =>
      authenticate(
        new Request("http://127.0.0.1:3000", {
          headers: { cookie: "tv_session=" + token + "tampered" },
        }),
      ),
    401,
  );
});
test("demo authentication fails closed in production", async () => {
  const old = process.env.NODE_ENV;
  Object.assign(process.env, { NODE_ENV: "production" });
  assert.equal(isDemo(), false);
  await denied(() => makeDemoSession(student.id), 403);
  Object.assign(process.env, { NODE_ENV: old });
});
test("compiled demo opt-in is limited to an explicit loopback origin", () => {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    TRUSTVAULT_LOOPBACK_DEMO: process.env.TRUSTVAULT_LOOPBACK_DEMO,
    APP_ORIGIN: process.env.APP_ORIGIN,
  };
  try {
    Object.assign(process.env, {
      NODE_ENV: "production",
      TRUSTVAULT_LOOPBACK_DEMO: "1",
      APP_ORIGIN: "http://127.0.0.1:3000",
    });
    assert.equal(isDemo(), true);
    process.env.APP_ORIGIN = "https://public.example.test";
    assert.equal(isDemo(), false);
    delete process.env.TRUSTVAULT_LOOPBACK_DEMO;
    process.env.APP_ORIGIN = "http://127.0.0.1:3000";
    assert.equal(isDemo(), false);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
test("cross-origin mutations are rejected", () => {
  assert.throws(() =>
    assertSameOrigin(
      new Request("http://127.0.0.1:3000", {
        headers: { origin: "https://attacker.example" },
      }),
    ),
  );
  assert.doesNotThrow(() =>
    assertSameOrigin(
      new Request("http://127.0.0.1:3000", {
        headers: { origin: process.env.APP_ORIGIN! },
      }),
    ),
  );
});
test("another student, a recipient and an administrator cannot retrieve an original document", async () => {
  await denied(() => s.preview(otherStudent, "doc-enrolment"), 404);
  await denied(() => s.preview(recipient, "doc-enrolment"), 404);
  await denied(() => s.preview(adminA, "doc-enrolment"), 404);
  const p = await s.preview(student, "doc-enrolment");
  assert.equal(p.bytes.subarray(0, 5).toString(), "%PDF-");
});
test("stored file is ciphertext and authenticated encryption detects tampering", async () => {
  const d = await getDb().document.findUniqueOrThrow({
    where: { id: "doc-passport" },
  });
  const file = path.resolve(process.env.STORAGE_DIR!, d.storageId),
    original = await readFile(file);
  assert.equal(original.includes(Buffer.from("SYN-P0000842")), false);
  const tampered = Buffer.from(original);
  tampered[tampered.length - 1] ^= 1;
  await writeFile(file, tampered);
  await assert.rejects(() => readFilePrivate(d.storageId));
  await writeFile(file, original);
  await assert.rejects(() => readFilePrivate("../doc-enrolment"));
});
test("upload validation rejects unsupported files, spoofed MIME, empty and oversized uploads", () => {
  assert.throws(() => validateFile(Buffer.from("hello"), "text/plain"));
  assert.throws(() => validateFile(Buffer.from("bad png"), "image/png"));
  assert.throws(() => validateFile(Buffer.alloc(0), "application/pdf"));
  assert.throws(() =>
    validateFile(Buffer.alloc(5 * 1024 * 1024 + 1), "application/pdf"),
  );
  assert.doesNotThrow(() =>
    validateFile(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]),
      "image/png",
    ),
  );
  assert.doesNotThrow(() =>
    validateFile(Buffer.from([255, 216, 255, 224]), "image/jpeg"),
  );
});
test("student uploads are encrypted and explicitly have no extracted attributes", async () => {
  const bytes = (await s.preview(student, "doc-enrolment")).bytes;
  const d = await s.upload(
    student,
    new File([bytes], "synthetic.pdf", { type: "application/pdf" }),
    "Uploaded demo certificate",
    "enrolment",
  );
  const stored = await getDb().document.findUniqueOrThrow({
    where: { id: d.id },
  });
  assert.deepEqual(stored.attributes, {});
  assert.match(stored.attributeSource, /not extracted or verified/);
  await denied(
    () =>
      s.upload(
        adminA,
        new File([bytes], "demo.pdf", { type: "application/pdf" }),
        "Demo",
        "enrolment",
      ),
    403,
  );
});
test("an unrelated recipient cannot use a grant; denied access is audited", async () => {
  await denied(() => s.accessGrant(otherRecipient, "grant-active"), 403);
  assert.equal(
    await getDb().accessEvent.count({
      where: {
        actorId: otherRecipient.id,
        action: "GRANT_ACCESS",
        outcome: "DENIED",
      },
    }),
    1,
  );
});
test("recipient server responses contain exactly approved attributes and no document internals", async () => {
  const data = await s.accessGrant(recipient, "grant-active");
  assert.deepEqual(Object.keys(data!.attributes).sort(), [
    "enrolmentStatus",
    "fullName",
  ]);
  const raw = JSON.stringify(data);
  for (const forbidden of [
    "passportNumber",
    "homeAddress",
    "insurancePolicyNumber",
    "storageId",
    "studentId",
    "course",
    "SYN-P0000842",
  ])
    assert.equal(raw.includes(forbidden), false, forbidden);
  assert.equal(
    await getDb().accessEvent.count({
      where: {
        targetId: "grant-active",
        action: "GRANT_ACCESS",
        outcome: "SUCCESS",
      },
    }),
    1,
  );
});
test("expired and revoked grants fail on the next access", async () => {
  await denied(() => s.accessGrant(recipient, "grant-expired"), 403);
  await denied(() => s.accessGrant(recipient, "grant-revoked"), 403);
});
test("Guardian flags all three excessive accommodation fields and suggests only enrolment", () => {
  const result = assess(
    "An accommodation portal needs to verify student status.",
    [
      "enrolmentStatus",
      "passportNumber",
      "homeAddress",
      "insurancePolicyNumber",
    ],
    336,
  );
  assert.equal(result.risk, "high");
  assert.deepEqual(result.excessiveFields, [
    "passportNumber",
    "homeAddress",
    "insurancePolicyNumber",
  ]);
  assert.deepEqual(result.suggestedMinimum, ["enrolmentStatus"]);
  assert.equal(result.suggestedDurationHours, 24);
  assert.equal(result.mode, "Rules-based demo analysis");
});
test("nothing is granted before consent; student cannot approve another student request", async () => {
  assert.equal(
    await getDb().shareGrant.count({
      where: { requestId: "request-excessive" },
    }),
    0,
  );
  await denied(
    () =>
      s.decideRequest(otherStudent, "request-excessive", {
        decision: "APPROVE",
        fields: ["enrolmentStatus"],
        durationHours: 24,
      }),
    404,
  );
});
test("selected consent omits sensitive fields, disallows additional fields and overlong duration", async () => {
  await denied(
    () =>
      s.decideRequest(student, "request-excessive", {
        decision: "APPROVE",
        fields: ["course"],
        durationHours: 24,
      }),
    400,
  );
  await denied(
    () =>
      s.decideRequest(student, "request-excessive", {
        decision: "APPROVE",
        fields: ["enrolmentStatus"],
        durationHours: 169,
      }),
    400,
  );
  await s.decideRequest(student, "request-excessive", {
    decision: "APPROVE",
    fields: ["enrolmentStatus"],
    durationHours: 12,
  });
  const grant = await getDb().shareGrant.findFirstOrThrow({
    where: { requestId: "request-excessive" },
  });
  assert.deepEqual((await s.accessGrant(recipient, grant.id))!.attributes, {
    enrolmentStatus: "Currently enrolled",
  });
  await denied(() => s.revoke(otherStudent, grant.id), 404);
  await s.revoke(student, grant.id);
  await denied(() => s.accessGrant(recipient, grant.id), 403);
});
test("rejecting a request creates no grant, and a decided request cannot be replayed", async () => {
  await s.decideRequest(student, "request-reasonable", { decision: "REJECT" });
  assert.equal(
    await getDb().shareGrant.count({
      where: { requestId: "request-reasonable" },
    }),
    0,
  );
  await denied(
    () =>
      s.decideRequest(student, "request-reasonable", {
        decision: "APPROVE",
        fields: ["fullName"],
        durationHours: 1,
      }),
    409,
  );
});
test("recipient requests use the authenticated organisation and identity", async () => {
  const created = await s.createRequest(recipient, {
    studentId: student.id,
    purpose: "Confirm student status for a simulated tenancy.",
    documentKind: "enrolment",
    fields: ["enrolmentStatus"],
    durationHours: 12,
    recipientId: otherRecipient.id,
    organisation: "Spoofed",
  });
  const r = await getDb().shareRequest.findUniqueOrThrow({
    where: { id: created.id },
  });
  assert.equal(r.recipientId, recipient.id);
  assert.equal(r.status, "PENDING");
  await denied(
    () =>
      s.createRequest(student, {
        studentId: student.id,
        purpose: "Try to request information",
        documentKind: "enrolment",
        fields: ["enrolmentStatus"],
        durationHours: 1,
      }),
    403,
  );
});
test("pending policy is unchanged and proposer cannot approve own proposal", async () => {
  const p = await getDb().policy.findUniqueOrThrow({
    where: { id: "sharing" },
  });
  assert.equal(p.maxDurationHours, 168);
  assert.equal(p.version, 1);
  await denied(
    () => s.reviewPolicy(adminA, "proposal-duration", { decision: "APPROVE" }),
    403,
  );
  assert.equal(
    (await getDb().policy.findUniqueOrThrow({ where: { id: "sharing" } }))
      .maxDurationHours,
    168,
  );
  await denied(
    () => s.reviewPolicy(student, "proposal-duration", { decision: "APPROVE" }),
    403,
  );
});
test("second administrator applies the immutable proposal exactly once", async () => {
  await s.reviewPolicy(adminB, "proposal-duration", { decision: "APPROVE" });
  const p = await getDb().policy.findUniqueOrThrow({
    where: { id: "sharing" },
  });
  assert.equal(p.maxDurationHours, 336);
  assert.equal(p.version, 2);
  await denied(
    () => s.reviewPolicy(adminB, "proposal-duration", { decision: "APPROVE" }),
    409,
  );
  assert.equal(
    (await getDb().policy.findUniqueOrThrow({ where: { id: "sharing" } }))
      .version,
    2,
  );
  assert.equal(
    await getDb().accessEvent.count({
      where: { action: "POLICY_APPLIED", targetId: "proposal-duration" },
    }),
    1,
  );
});
test("subsequent grants use approved policy and current policy is rechecked at access", async () => {
  const r = await s.createRequest(recipient, {
    studentId: student.id,
    purpose: "Verify current student enrolment for accommodation.",
    documentKind: "enrolment",
    fields: ["enrolmentStatus"],
    durationHours: 300,
  });
  await s.decideRequest(student, r.id, {
    decision: "APPROVE",
    fields: ["enrolmentStatus"],
    durationHours: 300,
  });
  const g = await getDb().shareGrant.findFirstOrThrow({
    where: { requestId: r.id },
  });
  assert.equal(g.policyVersion, 2);
  assert.ok(await s.accessGrant(recipient, g.id));
  const p = await s.proposePolicy(adminA, {
    proposedMaxHours: 72,
    reason: "Shorten the maximum for a synthetic policy test.",
  });
  await s.reviewPolicy(adminB, p.id, { decision: "APPROVE" });
  await denied(() => s.accessGrant(recipient, g.id), 403);
});
test("rejected proposals leave policy unchanged and cannot be approved later", async () => {
  const before = await getDb().policy.findUniqueOrThrow({
    where: { id: "sharing" },
  });
  const p = await s.proposePolicy(adminA, {
    proposedMaxHours: 48,
    reason: "Test rejected immutable proposal.",
  });
  await s.reviewPolicy(adminB, p.id, { decision: "REJECT" });
  assert.deepEqual(
    await getDb().policy.findUniqueOrThrow({ where: { id: "sharing" } }),
    before,
  );
  await denied(
    () => s.reviewPolicy(adminB, p.id, { decision: "APPROVE" }),
    409,
  );
});
test("student overview has no other owners documents; administrators receive no documents or grants", async () => {
  const own = await s.overview(otherStudent);
  assert.deepEqual("documents" in own ? own.documents : undefined, []);
  const admin = await s.overview(adminA);
  assert.equal("documents" in admin, false);
  assert.equal("grants" in admin, false);
  const recipientView = await s.overview(recipient);
  assert.equal(JSON.stringify(recipientView).includes("storageId"), false);
});
test("proposal content cannot be edited after submission at the database boundary", async () => {
  await assert.rejects(() =>
    getDb().adminChangeRequest.update({
      where: { id: "proposal-duration" },
      data: { proposedMaxHours: 600 },
    }),
  );
});
test("installed TideCloak SDK verifies signed tokens and rejects invalid signatures, issuer, client, expiry and roles", async () => {
  const previous = {
    AUTH_MODE: process.env.AUTH_MODE,
    TIDECLOAK_CONFIG_JSON: process.env.TIDECLOAK_CONFIG_JSON,
    TIDECLOAK_ISSUER: process.env.TIDECLOAK_ISSUER,
    TIDECLOAK_CLIENT_ID: process.env.TIDECLOAK_CLIENT_ID,
  };
  const { publicKey, privateKey } = await generateKeyPair("EdDSA");
  const jwk = {
    ...(await exportJWK(publicKey)),
    kid: "test-signing-key",
    alg: "EdDSA",
  };
  const issuer = "https://identity.example.test/realms/trustvault";
  Object.assign(process.env, {
    AUTH_MODE: "tidecloak",
    TIDECLOAK_ISSUER: issuer,
    TIDECLOAK_CLIENT_ID: "trustvault",
    TIDECLOAK_CONFIG_JSON: JSON.stringify({
      "auth-server-url": "https://identity.example.test",
      realm: "trustvault",
      resource: "trustvault",
      jwk: { keys: [jwk] },
    }),
  });
  await getDb().user.create({
    data: {
      subject: "real:test-subject",
      name: "Test Verified Student",
      email: "signed-token@example.test",
      role: "STUDENT",
      demo: false,
    },
  });
  const token = (overrides: Record<string, unknown> = {}) =>
    new SignJWT({
      sub: "real:test-subject",
      iss: issuer,
      azp: "trustvault",
      realm_access: { roles: ["student"] },
      exp: Math.floor(Date.now() / 1000) + 300,
      ...overrides,
    })
      .setProtectedHeader({ alg: "EdDSA", kid: "test-signing-key" })
      .sign(privateKey);
  try {
    const valid = await token();
    assert.equal((await verifyTideToken(valid)).user.role, "STUDENT");
    await denied(() => verifyTideToken(valid.slice(0, -5) + "wrong"), 401);
    for (const overrides of [
      { iss: "https://wrong.example.test" },
      { azp: "other-client" },
      { exp: 1 },
      { realm_access: { roles: ["recipient"] } },
    ])
      await assert.rejects(() => token(overrides).then(verifyTideToken));
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("missing authentication settings never advertise a configured provider", async () => {
  for (const mode of [undefined, "tidecloak"]) {
    await withAuthEnv(
      {
        AUTH_MODE: mode,
        APP_ORIGIN: undefined,
        TIDECLOAK_ISSUER: undefined,
        TIDECLOAK_CLIENT_SECRET: undefined,
        TIDECLOAK_CONFIG_JSON: undefined,
      },
      async () => {
        const origin = "https://trustvault.example.test";
        const response = await apiGet(
          new NextRequest(origin + "/api/session"),
          {
            params: Promise.resolve({ path: ["session"] }),
          },
        );
        const session = await response.json();
        assert.equal(session.configured, false);
        assert.equal(session.user, null);
        assert.deepEqual(session.identities, []);
        assert.equal(tidecloakLoginConfigured(), false);
        const login = await authGet(new NextRequest(origin + "/auth/login"), {
          params: Promise.resolve({ action: "login" }),
        });
        const location = new URL(login.headers.get("location")!);
        assert.equal(location.origin, origin);
        assert.equal(location.searchParams.get("authError"), "configuration");
        assert.equal(login.cookies.get("tv_tide"), undefined);
      },
    );
  }
});

test("a deployed login with a localhost APP_ORIGIN fails on the deployed website", async () => {
  await withAuthEnv(
    { AUTH_MODE: "tidecloak", APP_ORIGIN: "http://127.0.0.1:3000" },
    async () => {
      const origin = "https://trustvault-odin.vercel.app";
      const response = await authGet(new NextRequest(origin + "/auth/login"), {
        params: Promise.resolve({ action: "login" }),
      });
      const location = new URL(response.headers.get("location")!);
      assert.equal(location.origin, origin);
      assert.equal(location.searchParams.get("authError"), "origin");
      assert.match(response.headers.get("cache-control")!, /no-store/);
      assert.equal(response.cookies.get("tv_tide"), undefined);
    },
  );
});

test("configured TideCloak login validates state and PKCE and sets a verified session", async () => {
  const { publicKey, privateKey } = await generateKeyPair("EdDSA");
  const jwk = {
    ...(await exportJWK(publicKey)),
    kid: "callback-test-key",
    alg: "EdDSA",
  };
  const origin = "https://trustvault.example.test";
  const issuer = "https://callback-identity.example.test/realms/trustvault";
  const subject = "real:callback-test-subject";
  await getDb().user.create({
    data: {
      subject,
      name: "Callback Student",
      email: "callback-student@example.test",
      role: "STUDENT",
      demo: false,
    },
  });
  await withAuthEnv(
    {
      NODE_ENV: "production",
      AUTH_MODE: "tidecloak",
      APP_ORIGIN: origin,
      TIDECLOAK_ISSUER: issuer,
      TIDECLOAK_CLIENT_ID: "trustvault",
      TIDECLOAK_CLIENT_SECRET: "callback-test-only-secret",
      TIDECLOAK_CONFIG_JSON: JSON.stringify({
        "auth-server-url": "https://callback-identity.example.test",
        realm: "trustvault",
        resource: "trustvault",
        jwk: { keys: [jwk] },
      }),
    },
    async () => {
      assert.equal(tidecloakLoginConfigured(), true);
      const accessToken = await new SignJWT({
        sub: subject,
        iss: issuer,
        azp: "trustvault",
        realm_access: { roles: ["student"] },
        exp: Math.floor(Date.now() / 1000) + 300,
      })
        .setProtectedHeader({ alg: "EdDSA", kid: "callback-test-key" })
        .sign(privateKey);
      const login = await authGet(new NextRequest(origin + "/auth/login"), {
        params: Promise.resolve({ action: "login" }),
      });
      const location = new URL(login.headers.get("location")!);
      assert.equal(location.origin, "https://callback-identity.example.test");
      assert.equal(
        location.searchParams.get("redirect_uri"),
        origin + "/auth/callback",
      );
      assert.equal(location.searchParams.get("code_challenge_method"), "S256");
      assert.ok(location.searchParams.get("code_challenge"));
      const state = location.searchParams.get("state")!;
      const saved = login.cookies.get("tv_oidc")!;
      assert.equal(saved.path, "/auth");
      assert.equal(saved.httpOnly, true);
      assert.equal(saved.secure, true);
      const originalFetch = globalThis.fetch;
      let exchanges = 0;
      globalThis.fetch = async (input, init) => {
        assert.equal(String(input), issuer + "/protocol/openid-connect/token");
        exchanges++;
        const body = new URLSearchParams(String(init?.body));
        assert.equal(body.get("redirect_uri"), origin + "/auth/callback");
        assert.equal(body.get("grant_type"), "authorization_code");
        assert.ok(body.get("code_verifier"));
        return providerResponse({ access_token: accessToken });
      };
      const callback = (stateValue: string) =>
        authGet(
          new NextRequest(
            origin +
              "/auth/callback?code=test-code&state=" +
              encodeURIComponent(stateValue),
            { headers: { cookie: `tv_oidc=${saved.value}` } },
          ),
          { params: Promise.resolve({ action: "callback" }) },
        );
      try {
        const rejected = await callback("wrong-state");
        assert.equal(exchanges, 0);
        assert.equal(rejected.cookies.get("tv_tide"), undefined);
        assert.equal(rejected.cookies.get("tv_oidc")?.path, "/auth");
        const accepted = await callback(state);
        assert.equal(exchanges, 1);
        assert.equal(accepted.headers.get("location"), origin + "/");
        const session = accepted.cookies.get("tv_tide")!;
        assert.equal(session.value, accessToken);
        assert.equal(session.httpOnly, true);
        assert.equal(session.secure, true);
        assert.equal(accepted.cookies.get("tv_oidc")?.path, "/auth");
        const user = await authenticate(
          new Request(origin, {
            headers: { cookie: `tv_tide=${session.value}` },
          }),
        );
        assert.equal(user.subject, subject);
      } finally {
        globalThis.fetch = originalFetch;
      }
    },
  );
});

test("verified TideCloak cookies drive the real session and overview; logout removes app cookies", async () => {
  const { publicKey, privateKey } = await generateKeyPair("EdDSA");
  const origin = "https://vault-session.example.test",
    issuer = "https://identity-session.example.test/realms/trustvault";
  const jwk = {
    ...(await exportJWK(publicKey)),
    kid: "session-test-key",
    alg: "EdDSA",
  };
  const subject = "real:http-session-test";
  await getDb().user.create({
    data: {
      subject,
      name: "Session Student",
      email: "session-student@example.test",
      role: "STUDENT",
      demo: false,
    },
  });
  await withAuthEnv(
    {
      WORKSPACE_MODE: "tidecloak",
      AUTH_MODE: "tidecloak",
      APP_ORIGIN: origin,
      TIDECLOAK_ISSUER: issuer,
      TIDECLOAK_CLIENT_ID: "trustvault",
      TIDECLOAK_CLIENT_SECRET: "fixture-secret",
      TIDECLOAK_CONFIG_JSON: JSON.stringify({
        "auth-server-url": "https://identity-session.example.test",
        realm: "trustvault",
        resource: "trustvault",
        jwk: { keys: [jwk] },
      }),
    },
    async () => {
      const token = await new SignJWT({
        sub: subject,
        iss: issuer,
        azp: "trustvault",
        realm_access: { roles: ["student"] },
      })
        .setProtectedHeader({ alg: "EdDSA", kid: "session-test-key" })
        .setExpirationTime("5m")
        .sign(privateKey);
      const request = (path: string, cookie = token) =>
        new NextRequest(origin + "/api/" + path, {
          headers: { cookie: "tv_tide=" + cookie },
        });
      const session = await apiGet(request("session"), {
        params: Promise.resolve({ path: ["session"] }),
      });
      const data = await session.json();
      assert.equal(data.user.name, "Session Student");
      assert.equal(data.demo, false);
      assert.equal(data.configured, true);
      assert.deepEqual(data.identities, []);
      assert.equal("token" in data, false);
      assert.match(session.headers.get("cache-control")!, /no-store/);
      const overview = await apiGet(request("overview"), {
        params: Promise.resolve({ path: ["overview"] }),
      });
      assert.equal(overview.status, 200);
      const vault = await overview.json();
      assert.deepEqual(vault.documents, []);
      assert.deepEqual(vault.grants, []);
      const invalid = await apiGet(request("session", "forged"), {
        params: Promise.resolve({ path: ["session"] }),
      });
      assert.equal((await invalid.json()).user, null);
      assert.equal(invalid.cookies.get("tv_tide")?.value, "");
      const logout = await apiPost(
        new NextRequest(origin + "/api/logout", {
          method: "POST",
          headers: { origin, cookie: "tv_tide=" + token },
        }),
        { params: Promise.resolve({ path: ["logout"] }) },
      );
      assert.equal(logout.status, 200);
      assert.equal(logout.cookies.get("tv_tide")?.value, "");
    },
  );
});

test("browser demo mode never exposes authenticated server operations", async () => {
  await withAuthEnv({ WORKSPACE_MODE: "demo" }, async () => {
    const response = await apiGet(
      new NextRequest("https://vault.example.test/api/session"),
      { params: Promise.resolve({ path: ["session"] }) },
    );
    assert.equal(response.status, 503);
    const login = await authGet(
      new NextRequest("https://vault.example.test/auth/login"),
      { params: Promise.resolve({ action: "login" }) },
    );
    assert.equal(login.headers.get("location"), "https://vault.example.test/");
  });
});
