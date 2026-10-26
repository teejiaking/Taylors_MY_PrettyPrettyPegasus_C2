import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { hostedStorage } from "../lib/hosted-storage";

// Validate the server-only key before making any request.
hostedStorage();
const bucket = process.env.SUPABASE_STORAGE_BUCKET || "trustvault-documents";
const client = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  },
);
const { data, error } = await client.storage.getBucket(bucket);
if (data) {
  if (data.public)
    throw new Error(
      "Refusing a public document bucket. Make it private before continuing.",
    );
  console.log("Existing private document bucket verified.");
} else {
  if (!error || !["404", "400"].includes(String(error.statusCode)))
    throw new Error("Cannot inspect private document storage.");
  const created = await client.storage.createBucket(bucket, {
    public: false,
    allowedMimeTypes: ["application/octet-stream"],
    fileSizeLimit: 5 * 1024 * 1024 + 28,
  });
  if (created.error) throw new Error("Cannot create private document storage.");
  console.log("Private encrypted document bucket created.");
}
