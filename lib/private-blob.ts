import { AppError } from "./errors";

// Same versioned private-store protocol as Vercel's official Blob client:
// https://github.com/vercel/storage/tree/main/packages/blob/src
// Credentials and object locations never enter client responses.
const controlOrigin = "https://vercel.com/api/blob";
const maximumEnvelope = 5 * 1024 * 1024 + 28;
function credentials() {
  const token = process.env.BLOB_READ_WRITE_TOKEN || "";
  const storeId = token.split("_")[3] || "";
  if (!token.startsWith("vercel_blob_rw_") || !/^[a-z0-9]+$/i.test(storeId))
    throw new Error(
      "Configure a server-only BLOB_READ_WRITE_TOKEN for a private Vercel Blob store.",
    );
  return { token, storeId: storeId.toLowerCase() };
}
export function privateBlobConfigured() {
  try {
    credentials();
    return true;
  } catch {
    return false;
  }
}
function location(id: string) {
  if (!/^[a-f0-9-]{36}$/.test(id))
    throw new AppError(400, "Invalid storage identifier.");
  const { token, storeId } = credentials();
  const pathname = `documents/${id}`;
  return {
    token,
    storeId,
    pathname,
    url: `https://${storeId}.private.blob.vercel-storage.com/${pathname}`,
  };
}
function unavailable(): never {
  throw new AppError(
    503,
    "Private document storage is unavailable. Try again shortly.",
  );
}
async function call(url: string, init: RequestInit) {
  try {
    return await fetch(url, {
      ...init,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    return unavailable();
  }
}
export async function putPrivateBlob(id: string, ciphertext: Buffer) {
  const object = location(id);
  const response = await call(
    `${controlOrigin}/?${new URLSearchParams({ pathname: object.pathname })}`,
    {
      method: "PUT",
      body: new Uint8Array(ciphertext),
      headers: {
        Authorization: `Bearer ${object.token}`,
        "x-api-version": "13",
        "x-vercel-blob-store-id": object.storeId,
        "x-vercel-blob-access": "private",
        "x-content-type": "application/octet-stream",
        "x-add-random-suffix": "0",
        "x-allow-overwrite": "0",
        "x-cache-control-max-age": "60",
      },
    },
  );
  if (!response.ok) return unavailable();
  const metadata = await response.json().catch(() => null);
  if (metadata?.url !== object.url || metadata?.pathname !== object.pathname)
    return unavailable();
}
export async function getPrivateBlob(id: string) {
  const object = location(id);
  const response = await call(object.url, {
    headers: { Authorization: `Bearer ${object.token}` },
  });
  if (!response.ok || !response.body) return unavailable();
  const chunks: Uint8Array[] = [];
  let length = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > maximumEnvelope) {
        await reader.cancel();
        return unavailable();
      }
      chunks.push(value);
    }
  } catch {
    return unavailable();
  }
  if (length < 28) return unavailable();
  return Buffer.concat(chunks);
}
export async function deletePrivateBlob(id: string) {
  const object = location(id);
  const response = await call(`${controlOrigin}/delete`, {
    method: "POST",
    body: JSON.stringify({ urls: [object.url] }),
    headers: {
      Authorization: `Bearer ${object.token}`,
      "content-type": "application/json",
      "x-api-version": "13",
      "x-vercel-blob-store-id": object.storeId,
    },
  });
  if (!response.ok) return unavailable();
}
