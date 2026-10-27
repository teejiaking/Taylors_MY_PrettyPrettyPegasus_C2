import { test } from "node:test";
import assert from "node:assert/strict";
import {
  storeFile,
  readFilePrivate,
  removeFile,
  AppError,
  storageConfigured,
} from "../lib/storage";
import { databaseBackend, databaseConfigured, getDb } from "../lib/db";
import { privateBlobConfigured } from "../lib/private-blob";

async function withEnv(
  values: Record<string, string | undefined>,
  work: () => Promise<void>,
) {
  const previous = Object.fromEntries(
    Object.keys(values).map((key) => [key, process.env[key]]),
  );
  try {
    for (const [key, value] of Object.entries(values))
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    await work();
  } finally {
    for (const [key, value] of Object.entries(previous))
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
  }
}
const blobEnv = {
  STORAGE_BACKEND: "vercel-blob",
  DOCUMENT_ENCRYPTION_KEY: "a".repeat(64),
  BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_store123_test-only",
};

test("Vercel storage receives ciphertext and private requests only", async () =>
  withEnv(blobEnv, async () => {
    const oldFetch = globalThis.fetch;
    let sealed = Buffer.alloc(0),
      id = "",
      removed = false;
    const original = Buffer.from("%PDF-1.4 synthetic private upload");
    globalThis.fetch = async (input, init) => {
      const url = String(input),
        headers = new Headers(init?.headers);
      assert.equal(
        headers.get("authorization"),
        `Bearer ${blobEnv.BLOB_READ_WRITE_TOKEN}`,
      );
      assert.equal(init?.redirect, "error");
      assert.equal(init?.cache, "no-store");
      if (init?.method === "PUT") {
        assert.equal(headers.get("x-vercel-blob-access"), "private");
        assert.equal(headers.get("x-content-type"), "application/octet-stream");
        assert.equal(headers.get("x-allow-overwrite"), "0");
        assert.equal(headers.get("x-api-version"), "13");
        const pathname = new URL(url).searchParams.get("pathname")!;
        id = pathname.slice("documents/".length);
        sealed = Buffer.from(init!.body as Uint8Array);
        assert.equal(sealed.includes(original), false);
        assert.equal(sealed.length, original.length + 28);
        return Response.json({
          pathname,
          url: `https://store123.private.blob.vercel-storage.com/${pathname}`,
        });
      }
      if (url === "https://vercel.com/api/blob/delete") {
        assert.deepEqual(JSON.parse(String(init?.body)), {
          urls: [
            `https://store123.private.blob.vercel-storage.com/documents/${id}`,
          ],
        });
        removed = true;
        return new Response(null, { status: 200 });
      }
      assert.equal(
        url,
        `https://store123.private.blob.vercel-storage.com/documents/${id}`,
      );
      return new Response(new Uint8Array(sealed));
    };
    try {
      const storageId = await storeFile(original, "application/pdf");
      assert.equal(storageId, id);
      assert.deepEqual(await readFilePrivate(id), original);
      sealed[20] ^= 1;
      await assert.rejects(() => readFilePrivate(id));
      await removeFile(id);
      assert.equal(removed, true);
    } finally {
      globalThis.fetch = oldFetch;
    }
  }));
test("public-store metadata and provider failures cannot fall back to local files", async () =>
  withEnv(blobEnv, async () => {
    const oldFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () =>
        Response.json({
          url: "https://store123.public.blob.vercel-storage.com/leak",
          pathname: "leak",
        });
      await assert.rejects(
        () => storeFile(Buffer.from("%PDF-1.4 test"), "application/pdf"),
        (error: unknown) => error instanceof AppError && error.status === 503,
      );
      globalThis.fetch = async () => new Response(null, { status: 403 });
      await assert.rejects(
        () => readFilePrivate("11111111-1111-4111-8111-111111111111"),
        (error: unknown) => error instanceof AppError && error.status === 503,
      );
    } finally {
      globalThis.fetch = oldFetch;
    }
  }));
test("object identifiers cannot send the Blob token to an arbitrary host", async () =>
  withEnv(blobEnv, async () => {
    const oldFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new Error("Unexpected network request");
    };
    try {
      await assert.rejects(
        () => readFilePrivate("https://attacker.example/token"),
        /Invalid storage identifier/,
      );
    } finally {
      globalThis.fetch = oldFetch;
    }
  }));
test("missing private credentials fail closed", async () =>
  withEnv({ ...blobEnv, BLOB_READ_WRITE_TOKEN: undefined }, async () => {
    assert.equal(privateBlobConfigured(), false);
    assert.equal(storageConfigured(), false);
    await assert.rejects(
      () => storeFile(Buffer.from("%PDF-1.4 test"), "application/pdf"),
      /BLOB_READ_WRITE_TOKEN/,
    );
  }));
test("Vercel refuses SQLite and local files but accepts a configured PostgreSQL connection", async () =>
  withEnv(
    {
      VERCEL: "1",
      DATABASE_BACKEND: "sqlite",
      DATABASE_URL: "file:./ignored.db",
      STORAGE_BACKEND: "local",
    },
    async () => {
      assert.equal(databaseConfigured(), false);
      assert.equal(storageConfigured(), false);
      assert.throws(() => getDb(), /persistent PostgreSQL/);
      process.env.DATABASE_BACKEND = "postgresql";
      process.env.POSTGRES_DATABASE_URL =
        "postgresql://test:test@db.example.test/test?sslmode=require";
      try {
        assert.equal(databaseBackend(), "postgresql");
        assert.equal(databaseConfigured(), true);
      } finally {
        delete process.env.POSTGRES_DATABASE_URL;
      }
    },
  ));
