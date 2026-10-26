import { test } from "node:test";
import assert from "node:assert/strict";
import { createBrowserWorkspace } from "../lib/browser-workspace";
import { samplePdfBytes } from "../lib/sample-documents";

type Overview = {
  user: { id: string; role: string };
  policy: { maxDurationHours: number; version: number };
  documents?: {
    id: string;
    attributes: Record<string, string>;
    size: number;
  }[];
  requests?: { id: string; status: string }[];
  grants?: { id: string; state: string; approvedFields: string[] }[];
  proposals?: { id: string; status: string }[];
  activity: { action: string; outcome: string }[];
};
const workspace = () => createBrowserWorkspace();
type Workspace = ReturnType<typeof workspace>;
const overview = (demo: Workspace) => demo.request<Overview>("overview");
const login = (demo: Workspace, userId: string) =>
  demo.request("identity", "POST", { userId });
const consent = (demo: Workspace, fields = ["enrolmentStatus"]) =>
  demo.request("requests/request-excessive/decide", "POST", {
    decision: "APPROVE",
    fields,
    durationHours: 24,
  });

test("opens immediately with sample documents without contacting a server", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error("Unexpected network request");
  };
  try {
    const demo = workspace();
    const data = await overview(demo);
    assert.equal(data.user.id, "student-maya");
    assert.equal(data.documents?.length, 3);
    assert.equal(
      data.requests?.filter((item) => item.status === "PENDING").length,
      2,
    );
    assert.equal(
      data.grants?.filter((item) => item.state === "ACTIVE").length,
      1,
    );
    await consent(demo);
    await login(demo, "recipient-campus");
    const shared = await overview(demo);
    const grant = shared.grants!.find((item) => !item.id.startsWith("grant-"))!;
    const result = await demo.request<{ attributes: Record<string, string> }>(
      `grants/${grant.id}/access`,
    );
    assert.deepEqual(result.attributes, {
      enrolmentStatus: "Currently enrolled",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("role switching keeps changes in the same demo and returns detached snapshots", async () => {
  const demo = workspace();
  const snapshot = await overview(demo);
  snapshot.documents![0].attributes.fullName = "Changed response";
  assert.equal(
    (await overview(demo)).documents![0].attributes.fullName,
    "Maya Chen",
  );
  await login(demo, "admin-jordan");
  const admin = await overview(demo);
  assert.equal(admin.documents, undefined);
  assert.equal(admin.grants, undefined);
  assert.throws(() => demo.previewDocument("doc-enrolment"), /demo role/);
  await assert.rejects(
    () => demo.request("identity", "POST", { userId: "forged" }),
    /demo identities/,
  );
});

test("recipient creates a pending request that the student can review", async () => {
  const demo = workspace();
  await login(demo, "recipient-campus");
  const request = await demo.request<{ id: string }>("requests", "POST", {
    studentId: "student-maya",
    purpose: "Verify student status for accommodation.",
    fields: ["enrolmentStatus"],
    documentKind: "enrolment",
    durationHours: 12,
    recipientId: "forged",
  });
  await assert.rejects(
    () =>
      demo.request(`requests/${request.id}/decide`, "POST", {
        decision: "APPROVE",
      }),
    /demo role/,
  );
  await login(demo, "student-maya");
  assert.equal(
    (await overview(demo)).requests!.find((item) => item.id === request.id)!
      .status,
    "PENDING",
  );
  await demo.request(`requests/${request.id}/decide`, "POST", {
    decision: "REJECT",
  });
  await assert.rejects(
    () =>
      demo.request(`requests/${request.id}/decide`, "POST", {
        decision: "APPROVE",
      }),
    /already been decided/,
  );
});

test("consent rejects additional fields, duplicate fields and overlong durations without changing state", async () => {
  const demo = workspace();
  await assert.rejects(() => consent(demo, ["course"]), /only attributes/);
  await assert.rejects(
    () => consent(demo, ["enrolmentStatus", "enrolmentStatus"]),
    /only once/,
  );
  await assert.rejects(
    () =>
      demo.request("requests/request-excessive/decide", "POST", {
        decision: "APPROVE",
        fields: ["enrolmentStatus"],
        durationHours: 169,
      }),
    /current policy/,
  );
  assert.equal(
    (await overview(demo)).requests!.find(
      (item) => item.id === "request-excessive",
    )!.status,
    "PENDING",
  );
  await consent(demo);
  await assert.rejects(() => consent(demo), /already been decided/);
});

test("approved attributes can span sample documents without exposing unapproved fields", async () => {
  const demo = workspace();
  await consent(demo, ["enrolmentStatus", "passportNumber"]);
  await login(demo, "recipient-campus");
  const grants = (await overview(demo)).grants!.filter(
    (grant) => !grant.id.startsWith("grant-"),
  );
  assert.equal(grants.length, 2);
  const received: Record<string, string> = {};
  for (const grant of grants) {
    const data = await demo.request<{ attributes: Record<string, string> }>(
      `grants/${grant.id}/access`,
    );
    Object.assign(received, data.attributes);
    assert.equal("file" in data, false);
  }
  assert.deepEqual(received, {
    passportNumber: "SYN-P0000842",
    enrolmentStatus: "Currently enrolled",
  });
});

test("revocation and expiry block later recipient access and record denied attempts", async () => {
  const demo = workspace();
  await demo.request("grants/grant-active/revoke", "POST");
  await login(demo, "recipient-campus");
  for (const [id, reason] of [
    ["grant-active", /revoked/],
    ["grant-expired", /expired/],
    ["grant-revoked", /revoked/],
  ] as const) {
    await assert.rejects(() => demo.request(`grants/${id}/access`), reason);
  }
  assert.equal(
    (await overview(demo)).activity.filter(
      (event) => event.outcome === "DENIED",
    ).length,
    3,
  );
  await assert.rejects(
    () => demo.request("grants/grant-active/revoke", "POST"),
    /demo role/,
  );
});

test("a grant stops working when its actual expiry time passes", async () => {
  const demo = workspace();
  await login(demo, "recipient-campus");
  const originalNow = Date.now;
  Date.now = () => originalNow() + 25 * 3600000;
  try {
    await assert.rejects(
      () => demo.request("grants/grant-active/access"),
      /expired/,
    );
  } finally {
    Date.now = originalNow;
  }
});

test("uploads retain bytes for preview without inventing extracted attributes", async () => {
  const demo = workspace();
  const bytes = samplePdfBytes("Demo upload", ["Fictional sample only"]);
  const form = new FormData();
  form.set("title", "My demo document");
  form.set("kind", "enrolment");
  form.set("file", new File([bytes], "demo.pdf", { type: "application/pdf" }));
  const uploaded = await demo.request<{ id: string }>(
    "documents",
    "POST",
    form,
  );
  const doc = (await overview(demo)).documents!.find(
    (item) => item.id === uploaded.id,
  )!;
  assert.deepEqual(doc.attributes, {});
  assert.equal(doc.size, bytes.byteLength);
  const url = demo.previewDocument(uploaded.id);
  const original = await fetch(url);
  assert.deepEqual(new Uint8Array(await original.arrayBuffer()), bytes);
  await demo.request("demo/reset", "POST");
  await assert.rejects(() => fetch(url));
});

test("upload validation rejects spoofed, oversized and empty files", async () => {
  const demo = workspace();
  for (const file of [
    new File(["fake"], "fake.pdf", { type: "application/pdf" }),
    new File([], "empty.pdf", { type: "application/pdf" }),
    new File([new Uint8Array(5 * 1024 * 1024 + 1)], "large.pdf", {
      type: "application/pdf",
    }),
  ]) {
    const form = new FormData();
    form.set("title", "Test document");
    form.set("kind", "other");
    form.set("file", file);
    await assert.rejects(() => demo.request("documents", "POST", form));
  }
  assert.equal((await overview(demo)).documents!.length, 3);
});

test("a different administrator applies a policy once; stale proposals fail", async () => {
  const demo = workspace();
  await login(demo, "admin-jordan");
  const created = await demo.request<{ id: string }>("proposals", "POST", {
    proposedMaxHours: 1,
    reason: "Shorter sharing duration for the demonstration.",
  });
  await assert.rejects(
    () =>
      demo.request(`proposals/${created.id}/review`, "POST", {
        decision: "APPROVE",
      }),
    /different administrator/,
  );
  assert.equal((await overview(demo)).policy.maxDurationHours, 168);
  await login(demo, "admin-sam");
  await demo.request(`proposals/${created.id}/review`, "POST", {
    decision: "APPROVE",
  });
  assert.deepEqual((await overview(demo)).policy, {
    maxDurationHours: 1,
    version: 2,
  });
  await assert.rejects(
    () =>
      demo.request(`proposals/${created.id}/review`, "POST", {
        decision: "APPROVE",
      }),
    /already been decided/,
  );
  await assert.rejects(
    () =>
      demo.request("proposals/proposal-duration/review", "POST", {
        decision: "APPROVE",
      }),
    /policy has changed/,
  );
  await login(demo, "recipient-campus");
  await assert.rejects(
    () => demo.request("grants/grant-active/access"),
    /current sharing duration policy/,
  );
});

test("rejecting a proposal leaves policy unchanged and prevents replay", async () => {
  const demo = workspace();
  await login(demo, "admin-sam");
  await demo.request("proposals/proposal-duration/review", "POST", {
    decision: "REJECT",
  });
  assert.deepEqual((await overview(demo)).policy, {
    maxDurationHours: 168,
    version: 1,
  });
  await assert.rejects(
    () =>
      demo.request("proposals/proposal-duration/review", "POST", {
        decision: "APPROVE",
      }),
    /already been decided/,
  );
});

test("reset restores the demo; separate visitors never share records", async () => {
  const demo = workspace(),
    other = workspace();
  await demo.request("requests/request-reasonable/decide", "POST", {
    decision: "REJECT",
  });
  assert.equal(
    (await overview(other)).requests!.find(
      (item) => item.id === "request-reasonable",
    )!.status,
    "PENDING",
  );
  await demo.request("demo/reset", "POST");
  assert.equal((await overview(demo)).user.id, "student-maya");
  assert.equal(
    (await overview(demo)).requests!.find(
      (item) => item.id === "request-reasonable",
    )!.status,
    "PENDING",
  );
});
