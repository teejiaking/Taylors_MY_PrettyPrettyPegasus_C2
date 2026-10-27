import { test } from "node:test";
import assert from "node:assert/strict";
import { serverApi, WorkspaceApiError } from "../lib/workspace-client";
import { workspaceMode } from "../lib/workspace-mode";

test("real requests use same-origin cookies and no-store responses", async () => {
  const request: typeof fetch = async (url, init) => {
    assert.equal(url, "/api/requests");
    assert.equal(init?.credentials, "same-origin");
    assert.equal(init?.cache, "no-store");
    assert.equal(
      new Headers(init?.headers).get("content-type"),
      "application/json",
    );
    assert.deepEqual(JSON.parse(String(init?.body)), {
      purpose: "Test request",
    });
    return Response.json({ id: "request-1" });
  };
  assert.deepEqual(
    await serverApi("requests", "POST", { purpose: "Test request" }, request),
    { id: "request-1" },
  );
});
test("multipart uploads retain the browser's generated boundary", async () => {
  const form = new FormData();
  form.set("title", "Synthetic upload");
  const request: typeof fetch = async (_url, init) => {
    assert.equal(init?.body, form);
    assert.equal(new Headers(init?.headers).has("content-type"), false);
    return Response.json({ id: "document-1" });
  };
  await serverApi("documents", "POST", form, request);
});
test("expired sessions retain a typed 401 instead of becoming a demo identity", async () => {
  const request: typeof fetch = async () =>
    Response.json({ error: "Sign in again." }, { status: 401 });
  await assert.rejects(
    () => serverApi("overview", "GET", undefined, request),
    (error: unknown) =>
      error instanceof WorkspaceApiError && error.status === 401,
  );
});
test("provider/server failures do not return HTML or invent successful data", async () => {
  await assert.rejects(
    () =>
      serverApi(
        "overview",
        "GET",
        undefined,
        async () => new Response("Upstream failed", { status: 503 }),
      ),
    /workspace is unavailable/,
  );
  await assert.rejects(
    () =>
      serverApi("overview", "GET", undefined, async () =>
        Response.json({ error: "Unavailable" }, { status: 503 }),
      ),
    (error: unknown) =>
      error instanceof WorkspaceApiError && error.status === 503,
  );
});
test("browser demo requires an explicit server setting", () => {
  const saved = process.env.WORKSPACE_MODE;
  try {
    delete process.env.WORKSPACE_MODE;
    assert.equal(workspaceMode(), "tidecloak");
    process.env.WORKSPACE_MODE = "unconfigured";
    assert.equal(workspaceMode(), "tidecloak");
    process.env.WORKSPACE_MODE = "demo";
    assert.equal(workspaceMode(), "demo");
  } finally {
    if (saved === undefined) delete process.env.WORKSPACE_MODE;
    else process.env.WORKSPACE_MODE = saved;
  }
});
