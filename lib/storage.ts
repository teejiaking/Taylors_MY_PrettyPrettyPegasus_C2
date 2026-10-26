import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { hostedStorage } from "./hosted-storage";
export const MAX_FILE_SIZE = 5 * 1024 * 1024;
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
function key() {
  const value = process.env.DOCUMENT_ENCRYPTION_KEY ?? "";
  if (!/^[a-f\d]{64}$/i.test(value))
    throw new Error("Configure a 32-byte hex DOCUMENT_ENCRYPTION_KEY.");
  return Buffer.from(value, "hex");
}
function checkId(id: string) {
  if (!/^[a-f0-9-]{36}$/.test(id))
    throw new AppError(400, "Invalid storage identifier.");
}
function remote() {
  const backend =
    process.env.STORAGE_BACKEND ||
    (process.env.VERCEL === "1" ? "supabase" : "local");
  if (!["local", "supabase"].includes(backend))
    throw new Error("Unknown STORAGE_BACKEND.");
  if (process.env.VERCEL === "1" && backend !== "supabase")
    throw new Error("Vercel requires persistent private storage.");
  return backend === "supabase";
}
function location(id: string) {
  checkId(id);
  const root = path.resolve(process.env.STORAGE_DIR ?? "./private-storage");
  if (
    root === path.resolve("public") ||
    root.startsWith(path.resolve("public") + path.sep)
  )
    throw new Error("Private storage cannot be inside public.");
  return path.join(root, id);
}
export function validateFile(bytes: Buffer, mime: string) {
  if (!bytes.length || bytes.length > MAX_FILE_SIZE)
    throw new AppError(400, "Choose a non-empty PDF, PNG, or JPEG up to 5 MB.");
  const valid =
    mime === "application/pdf"
      ? bytes.subarray(0, 5).toString() === "%PDF-"
      : mime === "image/png"
        ? bytes
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : mime === "image/jpeg"
          ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
          : false;
  if (!valid)
    throw new AppError(
      400,
      "Unsupported file or file signature does not match its type.",
    );
}
export async function storeFile(bytes: Buffer, mime: string) {
  validateFile(bytes, mime);
  const id = randomUUID(),
    iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(id));
  const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()]);
  const sealed = Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
  if (remote()) {
    const { error } = await hostedStorage().upload(id, sealed, {
      contentType: "application/octet-stream",
      upsert: false,
    });
    if (error)
      throw new AppError(
        503,
        "Private file storage is unavailable. Try again.",
      );
    return id;
  }
  const file = location(id);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, sealed, {
    mode: 0o600,
    flag: "wx",
  });
  return id;
}
export async function readFilePrivate(id: string) {
  checkId(id);
  let sealed: Buffer;
  if (remote()) {
    const { data, error } = await hostedStorage().download(id);
    if (error || !data)
      throw new AppError(
        503,
        "Private file storage is unavailable. Try again.",
      );
    sealed = Buffer.from(await data.arrayBuffer());
  } else sealed = await readFile(location(id));
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    sealed.subarray(0, 12),
  );
  decipher.setAAD(Buffer.from(id));
  decipher.setAuthTag(sealed.subarray(12, 28));
  return Buffer.concat([
    decipher.update(sealed.subarray(28)),
    decipher.final(),
  ]);
}
export async function removeFile(id: string) {
  checkId(id);
  if (remote()) {
    const { error } = await hostedStorage().remove([id]);
    if (error)
      throw new AppError(
        503,
        "Private file storage is unavailable. Try again.",
      );
  } else await unlink(location(id));
}
