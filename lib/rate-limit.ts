import { createHash } from "node:crypto";
import { AppError } from "./errors";

const state = globalThis as unknown as {
  trustvaultLimits?: Map<string, { count: number; until: number }>;
};
const limits = (state.trustvaultLimits ??= new Map());
// Per-process abuse protection. Provider/platform controls remain necessary
// for a distributed production limit across Vercel instances.
export function limitRequest(req: Request, bucket: string, maximum = 60) {
  const address =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const key = createHash("sha256")
    .update(bucket + ":" + address)
    .digest("hex");
  const now = Date.now();
  if (limits.size > 10000)
    for (const [id, value] of limits) if (value.until <= now) limits.delete(id);
  if (limits.size > 10000 && !limits.has(key))
    throw new AppError(429, "Too many requests. Try again shortly.");
  const entry = limits.get(key);
  if (!entry || entry.until <= now) {
    limits.set(key, { count: 1, until: now + 60000 });
    return;
  }
  if (entry.count >= maximum)
    throw new AppError(429, "Too many requests. Try again shortly.");
  entry.count++;
}
