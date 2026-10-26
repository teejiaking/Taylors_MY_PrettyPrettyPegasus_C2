# Supabase and Vercel

TrustVault uses Supabase email/password authentication, PostgreSQL records, and a private Storage bucket on Vercel. The optional local demo continues to use SQLite and a private directory. Existing local files and records are not automatically copied into the hosted database.

## Server environment

Set the following in the Vercel project's **Production** environment. Never prefix these keys with `NEXT_PUBLIC_`, commit their values, or paste secret values into chat.

| Variable                          | Value                                                                                     |
| --------------------------------- | ----------------------------------------------------------------------------------------- |
| `AUTH_MODE`                       | `supabase`                                                                                |
| `APP_ORIGIN`                      | Exact HTTPS production origin without a trailing slash                                    |
| `SUPABASE_URL`                    | Supabase project URL                                                                      |
| `SUPABASE_PUBLISHABLE_KEY`        | Project publishable key (or legacy anon key)                                              |
| `DATABASE_BACKEND`                | `supabase`                                                                                |
| `SUPABASE_DATABASE_URL`           | Project PostgreSQL connection string                                                      |
| `SUPABASE_MIGRATION_DATABASE_URL` | Session pooler URL for production-build migrations; falls back to `SUPABASE_DATABASE_URL` |
| `STORAGE_BACKEND`                 | `supabase`                                                                                |
| `SUPABASE_SECRET_KEY`             | Server-only secret key or legacy service-role key, used for private Storage               |
| `SUPABASE_STORAGE_BUCKET`         | `trustvault-documents`                                                                    |
| `DOCUMENT_ENCRYPTION_KEY`         | 32 random bytes encoded as 64 hex characters; retain it to decrypt existing uploads       |

For migrations use the **Session pooler** connection on port 5432. For the Vercel runtime use the **Transaction pooler** connection on port 6543. The application adds `pgbouncer=true` for that port, limits its Prisma connection pool to one connection per instance by default, and selects the private `trustvault` schema. Set `sslmode=require` or stronger TLS verification in the connection URL. Do not disable certificate validation.

`SESSION_SECRET` is needed only by the optional local demo and TideCloak adapter. Supabase Auth signs its own sessions. Leave TideCloak settings unset for this deployment.

## Apply the hosted schema

Save the session-pooler URL as `SUPABASE_DATABASE_URL` in the ignored local `.env`, then run:

```powershell
npm ci
npm run db:migrate:hosted
```

`supabase/migrations` contains the forward-only PostgreSQL migration source. The migration command stages identical files for Prisma and uses Prisma's migration history. Do not apply these same files separately through a second migration manager. The migration creates only the new `trustvault` schema; it does not replace `public`, `auth`, or existing local databases. It installs role, request, grant and governance constraints and the initial seven-day sharing policy, without demo accounts.

If all seven initial tables already exist without Prisma history, the command first requires a read-only Prisma schema diff with no differences and a passing hosted integrity verification. Only then does it mark the initial migration as applied. Partial or differing schemas stop deployment for review; no existing tables are reset.

The schema is private: anonymous and authenticated Data API roles have no schema/table/function grants, and RLS is enabled on all seven tables. The server database connection enforces the application's ownership, consent and role checks. Do not expose `trustvault` through the Data API or add permissive RLS policies to make browser requests work.

## Private encrypted Storage

With `SUPABASE_URL` and `SUPABASE_SECRET_KEY` saved locally, run:

```powershell
npm run storage:setup
```

This creates `trustvault-documents` as a private bucket, or verifies an existing bucket is private. It accepts only encrypted `application/octet-stream` objects, at most 5 MB plus the 28-byte encryption envelope. There are no public object URLs or browser Storage policies. The server verifies authorization, downloads the encrypted object with its server-only key, and decrypts the AES-256-GCM envelope for the document owner. Never rotate the encryption key without migrating existing objects.

## Supabase Auth

Enable email/password signup in the existing Supabase project. Set its Site URL to the production origin and add `<origin>/auth/callback` to the redirect allowlist. Keep email confirmation enabled. Signup sends a confirmation email; users then confirm and sign in. The app creates a Student mapping only after the configured Auth server verifies a confirmed, non-anonymous user. Recipient and administrator roles are assigned by an operator with `npm run auth:provision`, using `DATABASE_BACKEND=supabase` and the hosted connection. Editable signup metadata never assigns roles.

## Deploy and verify

Import the GitHub repository into the intended Vercel team, choose the repository root, Next.js and Node 24, and deploy the reviewed commit after environment setup. `npm ci` generates both Prisma clients. On Vercel production builds, `scripts/vercel-build.mjs` applies pending forward migrations and verifies the hosted schema before compiling Next.js. Its synthetic verification records and policy update are rolled back together. Preview builds do not run production migrations. A migration or verification failure stops the deployment. `vercel.json` and `next.config.ts` use the standard `.next` build directory on Vercel.

Run `npm test`, `npm run typecheck` and `npm run build` before release. After deployment, check `/api/session` reports `authMode: "supabase"`, `configured: true`, `demo: false` and an empty identity list for a signed-out visitor. Verify invalid credentials are rejected, then complete an actual confirmed-account sign-in, synthetic upload and owner-only preview. A passing local build or mocked Auth test does not establish live email delivery or successful production sign-in.

Vercel refuses SQLite and local file storage at runtime. Local seeding refuses hosted databases/storage; never reset a real-account database to create demonstration users.
