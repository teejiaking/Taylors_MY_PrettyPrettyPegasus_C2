import { createClient } from "@supabase/supabase-js";

export function hostedStorage() {
  const url = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret)
    throw new Error(
      "Configure SUPABASE_URL and the server-only SUPABASE_SECRET_KEY for private file storage.",
    );
  let privileged = secret.startsWith("sb_secret_");
  if (!privileged && secret.split(".").length === 3) {
    try {
      privileged =
        JSON.parse(Buffer.from(secret.split(".")[1], "base64url").toString())
          .role === "service_role";
    } catch {
      /* Invalid keys fail closed below. */
    }
  }
  if (!privileged)
    throw new Error(
      "Private server storage requires a secret key, not the public authentication key.",
    );
  const parsed = new URL(url);
  if (
    parsed.protocol !== "https:" &&
    !["127.0.0.1", "localhost"].includes(parsed.hostname)
  )
    throw new Error("Supabase storage requires HTTPS.");
  const client = createClient(url, secret, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return client.storage.from(
    process.env.SUPABASE_STORAGE_BUCKET || "trustvault-documents",
  );
}
