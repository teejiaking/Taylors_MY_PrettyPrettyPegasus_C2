# Vercel + TideCloak + Neon + private Blob

No Supabase services or SDKs are used. The app stays on Vercel; TideCloak runs separately on a publicly reachable HTTPS server. Keep the current hosted browser demo in WORKSPACE_MODE=demo until the real services below are configured and tested.

## 1. Create a PostgreSQL database

From the Vercel project's Storage/Marketplace area, connect Neon Postgres, or create a PostgreSQL database directly with Neon and connect its environment variables. Use a fresh application database/schema; do not reset an existing database.

Save the pooled connection as POSTGRES_DATABASE_URL and the direct connection as POSTGRES_MIGRATION_URL in ignored .env.local for explicit migration/provisioning. The app also accepts a PostgreSQL DATABASE_URL. Use TLS (sslmode=require or stronger); never disable certificate validation. The server selects the private trustvault schema and a small connection pool.

Run npm run db:migrate:postgres once to apply the committed forward-only PostgreSQL migration. It creates the application tables, checks, governance guards and initial sharing policy without demo users. Migrations are deliberately excluded from npm run build and scripts/vercel-build.mjs. A nonempty/different schema must be reviewed, never reset or blindly marked as migrated.

## 2. Create a private Blob store

In the Vercel project's Storage area create Vercel Blob with access set to Private. Connect it to the production environment and obtain its server-only BLOB_READ_WRITE_TOKEN from the store's settings. This adapter uses a private-store read/write token; it does not use public uploads, client tokens or public object URLs.

The server encrypts each original before uploading it under a random identifier. Reads go through the owner-authorized app route. Tokens, provider URLs and original files are never returned to recipients. A public-store response or provider failure stops the operation rather than falling back to local disk.

## 3. Configure Vercel

Use the repository root, Next.js, Node.js 24.x, npm ci, Build Command npm run build and Output Directory .next. Existing overrides calling scripts/vercel-build.mjs remain compatible.

Set these server environment variables:

| Variable | Value |
| --- | --- |
| WORKSPACE_MODE | tidecloak, after the services are ready |
| AUTH_MODE | tidecloak |
| APP_ORIGIN | Exact HTTPS application origin without a trailing slash |
| DATABASE_BACKEND | postgresql |
| POSTGRES_DATABASE_URL | Neon pooled PostgreSQL URL with TLS |
| STORAGE_BACKEND | vercel-blob |
| BLOB_READ_WRITE_TOKEN | Private Blob store read/write token |
| SESSION_SECRET | At least 32 random characters |
| DOCUMENT_ENCRYPTION_KEY | 32 random bytes encoded as 64 hex characters |
| TIDECLOAK_ISSUER | Your public HTTPS TideCloak realm issuer |
| TIDECLOAK_CLIENT_ID | Your registered app client ID |
| TIDECLOAK_CLIENT_SECRET | Confidential client secret |
| TIDECLOAK_CONFIG_JSON | Matching Tide adapter JSON including its JWK configuration |

Never add NEXT_PUBLIC_ to these variables. Keep the document encryption key stable; rotating it without re-encrypting existing files makes them unreadable. Keep migration credentials in the operator environment; the build does not need them.

Use the same hosted database when running auth:provision to map each real realm subject to its application role. In the operator terminal set DATABASE_BACKEND=postgresql as well as the hosted POSTGRES_DATABASE_URL; otherwise an existing local DATABASE_BACKEND=sqlite setting will correctly keep provisioning local. Restore sqlite when returning to the local development database. Permit the production /auth/callback URL in TideCloak. Redeploy after setting production variables.

## 4. Verify before using the hosted vault

Confirm live sign-in and logout, owner upload/preview, student consent, recipient access to exactly approved attributes, expiry/revocation, independent administrator review, and persistence across separate sessions/devices. Do not seed the local demo database in production or point SQLite/storage at /tmp.

The included automated tests use local signed identity fixtures and mocked Blob responses. Live Neon migration/queries, private Blob operations and live TideCloak enrollment cannot be certified until your accounts and credentials exist. Request rate limits are currently per instance; use platform/provider controls for limits across instances.

Official references: https://vercel.com/docs/vercel-blob/private-storage and https://neon.com/docs/guides/prisma
