# TrustVault

A working local hackathon prototype for private student documents, selective consent, revocable recipient access, and two-person policy approval. **Use synthetic data only.**

Visitors can browse the website without signing in. The public preview includes fictional documents, a request review, selective consent, recipient viewing, revocation, and an activity list held only in the current browser tab. Reloading resets the exercise. No private account data is fetched or exposed. Choose **Sign in / Create account** for persistent uploads and authenticated workflows; the original server authorization checks still apply to every private API.

## Real accounts: Supabase (current configuration)

The active workspace uses **Supabase Auth**. Hosted deployments use Supabase PostgreSQL and private encrypted Storage; local development can retain its separate SQLite database and private directory. Sign up with your own email, confirm it, then sign in. There is no demo account switcher in this mode. Start with `npm run setup` and see **[SUPABASE.md](SUPABASE.md)** for authentication and staff provisioning. Follow **[HOSTING.md](HOSTING.md)** for database migration, private Storage, Vercel environment variables and deployment. The TideCloak adapter remains optional and is inactive in Supabase mode.

## Sign-in redirects to localhost from a deployed website

If a hosted site sends you to `127.0.0.1:3000/?authError=1`, its sign-in configuration is missing or still points to a local development address. `127.0.0.1` refers to the visitor's own computer. It cannot serve the deployed website.

In the hosting project's environment settings, set `APP_ORIGIN` to the exact HTTPS website origin, such as `https://trustvault-odin.vercel.app`, and configure the intended provider. For Supabase, keep `AUTH_MODE=supabase`, `SUPABASE_URL`, and `SUPABASE_PUBLISHABLE_KEY`; allow that website's `/auth/callback` URL in Supabase. For TideCloak, use `AUTH_MODE=tidecloak`, the identity server's `TIDECLOAK_ISSUER`, `TIDECLOAK_CLIENT_ID`, `TIDECLOAK_CLIENT_SECRET`, and matching `TIDECLOAK_CONFIG_JSON`, plus the server-only session/encryption keys described below. A Vercel application URL is not a TideCloak realm URL. Redeploy after changing environment settings. Supabase support remains available; these are alternate sign-in providers.

The app now reports an unconfigured provider accurately and does not offer a TideCloak login for missing settings. Failed authentication stays on the website where it began. Changing authentication settings does not resolve the local SQLite/private-storage hosting limitation described below.

## Optional local demo

For an existing real-account configuration, deliberately switch `.env` to `AUTH_MODE="demo"`, `DATABASE_URL="file:./trustvault.db"` and `STORAGE_DIR="./private-storage"` first. Never run a demo reset against the real-account database. `demo:setup` preserves an existing `.env`; it does not switch its mode automatically.

Requires **Node.js 24.x** and npm. Node's built-in SQLite API is used only to initialize the local database file before Prisma migrations (a Windows engine workaround). Run from this project directory:

```powershell
npm ci
npm run demo:setup
npm run db:migrate
npm run db:seed
npm run build
npm run demo
```

Open **http://127.0.0.1:3000**. Keep that terminal running. Use this exact origin rather than `localhost`; mutation origin checks use `APP_ORIGIN`.

`demo:setup` creates an ignored `.env` from `.env.example`, with independently generated session and AES keys. It preserves an existing `.env`. No credentials are needed for the local demo. The login screen and header explicitly identify demo mode. `npm run demo` serves the compiled build and only accepts loopback connections with the exact configured Host header. Use `npm run dev` for source editing with hot reload.

Choose Maya Chen (student), Alex Morgan (CampusNest recipient), Jordan Lee (administrator/proposer), or Sam Rivera (administrator/reviewer). The header identity switch deliberately simulates signing in as each local account; it is unavailable in real mode and production. Roles are loaded on the server, never trusted from a submitted role or URL.

### Reset

```powershell
npm run demo:reset
```

Reset replaces the local demo records and encrypted files, preserving the encryption key. It restores four identities, three encrypted synthetic PDF documents, a reasonable request, the excessive accommodation request, active/expired/revoked grants, and a pending policy proposal. It also generates `examples/synthetic-upload.pdf` for the upload demonstration. Reload the browser after reset. Reset and seeding refuse production and non-demo mode. Do not use the demo database for real data.

### Checks

```powershell
npm test
npm run typecheck
npm run build
```

`npm test` migrates and resets a separate `prisma/trustvault-test.db` and uses `test-results/storage`; it does not reset the active real-account database or demo database. It runs 39 tests, including Supabase session/role tests, encrypted hosted-storage tests, Vercel persistence configuration checks and cryptographic token validation. SDK provider fixtures are used for automated Supabase success flows; these are not successful live email account tests.

With `npm run demo` or `npm run dev` running in another terminal:

```powershell
npm run test:http
npm run demo:reset
```

HTTP smoke checks exercise real HTTP authentication, owner-only preview, successful and rejected uploads, selective consent, no-store responses, expiry, revocation, self-approval denial and origin checks. They modify main demo records, hence reset afterward. The active sample grant expires 23 hours after each reset.

Webpack is used explicitly because Turbopack's Windows worker failed in this environment. Next.js is pinned to 16.2.12. Development mode still exhibited occasional manifest read races on this Windows/OneDrive/antivirus host, so **use the compiled `npm run demo` launcher for presentations**. Development artifacts use `.next/`; production builds use `.next-production/`. **Ordinary `npm start` intentionally cannot use demo login**, even if `.env` says `AUTH_MODE=demo`. The separate demo launcher explicitly opts into demo authentication in its own process, requires `APP_ORIGIN=http://127.0.0.1:PORT`, binds to 127.0.0.1, and rejects non-loopback clients and mismatched Host headers. Do not set its internal `TRUSTVAULT_LOOPBACK_DEMO` marker in deployment environments.

`npm ci` generates the Prisma client via `postinstall`. After changing `prisma/schema.prisma`, stop the running server before `npm run db:generate` on Windows because the native DLL is locked while in use. Builds do not regenerate the unchanged client. Do not rebuild `.next-production` while the compiled demo is running; use the dev server during source changes, then rebuild and relaunch the demo.

## Vercel build configuration

`vercel.json` selects the Next.js framework, `npm run build`, and `.next` output. `next.config.ts` uses `.next` when Vercel sets `VERCEL=1`; the separate local production directories described above remain available for local presentations. Set the Vercel Root Directory to the repository root and use Node.js 24.x. Redeploy the latest commit after changing settings. Keep Vercel system environment variables enabled so `VERCEL` is available during builds and at runtime.

Vercel uses the Supabase database and Storage backends. Follow **[HOSTING.md](HOSTING.md)** to migrate the private PostgreSQL schema, create the private document bucket and configure server secrets before deployment. Vercel does not provide durable shared SQLite or local files ([official SQLite guidance](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel)); this application rejects those backends on Vercel. Do not point them at `/tmp` or seed demo identities during builds.

For hosted Supabase authentication, configure `AUTH_MODE=supabase`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and `APP_ORIGIN` (the exact HTTPS deployment origin). Allow the matching `/auth/callback` URL in Supabase. Database and Storage variables are also required as described in HOSTING.md. `.env` is intentionally not committed.

## Implemented screens and operations

- Dashboard: document, pending request, active grant counts and recent activity.
- Vault: 5 MB PDF/PNG/JPEG uploads; MIME plus signature checks; owner-only original previews; sample attribute provenance.
- Requests: authenticated recipient identity and organisation, purpose, field list, duration, Guardian assessment, selected consent or rejection.
- Sharing centre: derived active/expired/revoked state, expiry, approved field names, immediate revocation.
- Recipient portal: request creation and authenticated approved-attribute access. Failed expired/revoked access is visible and audited.
- Governance: immutable proposals, independent review, rejection, exactly-once policy update and versioning.
- Activity: timestamped successful and denied access and meaningful workflow outcomes, without file contents or attribute values.

## Architecture and data

Next.js App Router + TypeScript + React + Tailwind CSS/custom component styling + Lucide icons. Route handlers delegate to a server-only service layer using Prisma/SQLite. The six required logical tables are `users`, `documents`, `share_requests`, `share_grants`, `access_events`, `admin_change_requests`; `policies` stores the current versioned sharing limit. Foreign keys, unique constraints, state/integrity triggers, and transactions protect key relationships. Migrations are committed under `prisma/migrations`.

Documents use random UUID storage names in ignored `private-storage/`, outside public assets. File contents are AES-256-GCM encrypted with a fresh 96-bit nonce and authenticated storage identifier. Owner-only preview decrypts on the server, uses a fixed filename and sandbox response header, and returns `Cache-Control: no-store`. Originals, storage paths, encryption keys, and permanent public file links are never sent to recipients. Recipient access projects approved keys from the source attributes inside an authorization/audit transaction.

Selective sharing deliberately uses **structured synthetic sample attributes**, stored as JSON in SQLite. Uploaded files have an empty attribute set and a visible **not extracted or verified** label. The attribute view is **not a redacted PDF**. Full-file sharing is not implemented. Synthetic metadata and attributes are not encrypted at rest in SQLite; the binary originals are encrypted. Host/database access can bypass application controls and reveal these synthetic values or server keys. This prototype does not claim protection against a database owner or host administrator, nor Tide-style end-to-end encryption.

On every recipient retrieval the server checks authentication, recipient identity and role, request/document/owner relationship, approved keys, expiry, revocation, and current maximum-duration policy. A policy reduction can deny an existing grant longer than the new maximum. Access is logged without attribute values. Revocation blocks later application access; it cannot erase copies or recall a response already authorized. UI data already displayed remains visible until the viewer closes or requests again. Failed access attempts require a fresh authorized request; there are no public bearer links.

## Guardian

**Rules-based demo analysis**, computed server-side from the stated purpose and requested field names. No LLM credentials were available. No model calls are made and no document content is transmitted. Student verification suggests enrolment confirmation, with name or student identifier only where applicable, flags unnecessary sensitive identifiers, and suggests at most 24 hours. It is an advisory heuristic, not legal advice, live AI inference, or a safety guarantee.

## Optional TideCloak configuration

No live TideCloak server, realm, client credentials, or user mappings were supplied. The **adapter is implemented and locally signature-tested; live sign-in is unverified**. It uses documented `verifyTideCloakToken(config, token, allowedRoles)` from `@tidecloak/nextjs/server`, installed SDK 0.14.40 (underlying `@tidecloak/verify` 0.14.33). Source inspection confirmed signature, issuer, expiry and `azp`/client-role validation. TrustVault additionally pins expected issuer/client, requires `exp` and `sub`, and maps the verified subject to a non-demo database account with a matching verified role. Unknown subjects fail closed; email is not an authorization identity.

To activate:

1. Run a reachable, licensed TideCloak realm and complete Tide identity setup according to the official documentation. For the default verifier algorithm list use an IGA/QEA-enabled realm issuing EdDSA tokens. The SDK also supports ES256/384/512; it intentionally rejects ordinary RS256 unless explicitly configured. TrustVault does not weaken that default.
2. Create a **confidential OIDC client**, client ID `trustvault`, with standard authorization-code flow and S256 PKCE. Set the exact redirect URI to `http://127.0.0.1:3000/auth/callback` for local development, or `https://your-host/auth/callback` for production. Configure the corresponding web origin, appropriate role scope/mappers, and an access-token lifetime below an hour. Download the realm client's adapter JSON (including `realm`, `auth-server-url`, `resource` and, if present, its verification JWKs).
3. Create realm or client roles `student`, `recipient`, `administrator`, and assign them to the intended accounts. Ensure those roles are present in access tokens. Create **two different administrator subjects**. Do not assign administrators student roles simply to access this app.
4. Keep the encryption and session secrets server-side. In `.env` set:

```dotenv
AUTH_MODE="tidecloak"
APP_ORIGIN="http://127.0.0.1:3000"
TIDECLOAK_ISSUER="https://YOUR-TIDECLOAK/realms/YOUR-REALM"
TIDECLOAK_CLIENT_ID="trustvault"
TIDECLOAK_CLIENT_SECRET="YOUR-CONFIDENTIAL-CLIENT-SECRET"
TIDECLOAK_CONFIG_JSON='{"realm":"YOUR-REALM","auth-server-url":"https://YOUR-TIDECLOAK","resource":"trustvault"}'
```

Use the downloaded adapter JSON for the last value rather than assuming the sample is complete for your realm. No secrets use `NEXT_PUBLIC_`. Set `APP_ORIGIN` and the issuer to HTTPS in production. The callback refuses HTTP production configuration. If local JWKs are included in the downloaded adapter, rotate the configuration with signing-key changes; omitting local JWKs uses the configured realm JWKS endpoint.

5. Provision explicit verified-subject mappings (replace the example `sub` values with each user's actual immutable TideCloak token subject):

```powershell
npm run auth:provision -- "STUDENT-SUB" "student@example.test" "Demo Student" STUDENT
npm run auth:provision -- "RECIPIENT-SUB" "verify@example.test" "Demo Recipient" RECIPIENT "Simulated CampusNest"
npm run auth:provision -- "ADMIN-A-SUB" "admin-a@example.test" "Admin A" ADMINISTRATOR
npm run auth:provision -- "ADMIN-B-SUB" "admin-b@example.test" "Admin B" ADMINISTRATOR
```

6. Restart `npm run dev` for local real-auth validation. The UI now offers TideCloak login; demo endpoints are disabled. New live students start with an empty vault. Demo accounts are not automatically converted or linked to a real identity. Before a real deployment, use a fresh SQLite database/private storage directory and run `npm run db:migrate`, then provision mappings. For production run `npm run build` and `npm start` after HTTPS/reverse-proxy setup.

The implemented sign-in adapter uses standard TideCloak OIDC endpoints for an authorization-code exchange, signed state, PKCE and an HttpOnly access-token cookie. The verifier runs on every API request; valid configured Bearer tokens are also supported. It does not silently refresh tokens; users sign in again on expiry. Sign out clears application cookies; it is not upstream single sign-out. Advanced SWE/DPoP/encrypted token-exchange realm modes may require the corresponding documented SDK exchange integration and must be validated against your actual realm before claiming compatibility. No end-to-end live Tide/Fabric login was possible here.

### Governance attribution

Official TideCloak documentation describes native QEA capture/authorize/commit for **governed IAM administrative writes** under `/admin/realms/{realm}/iga/change-requests`. That is not a documented drop-in governor for a Prisma SQLite sharing-duration row. This build therefore implements **application-level dual approval**, prominently labelled in the UI. It does not claim native Fabric enforcement or call invented governance APIs.

The proposer records immutable content and its hash. A different authenticated administrator approves/rejects. One reviewer field represents the required independent approval; repeat decisions return 409. Proposal content cannot be edited in place. Status transition, policy compare-and-set version increment, application timestamp and audit entry commit together. A stale proposal is rejected and must be resubmitted against current policy. Pending/rejected proposals do not change policy, and administrators receive no student document data.

Official sources consulted 22 October 2026:

- [Next.js SDK API/reference](https://docs.tide.org/Languages/NextJS/tidecloak-nextjs-reference)
- [TideCloak JWT verifier details](https://docs.tide.org/Languages/NextJS/VerifyJWT)
- [TideCloak native QEA management API](https://docs.tide.org/API/Management%20API)
- [TideCloak architecture and standard interfaces](https://docs.tide.org/architecture)

## Practical limits

This is a single-host, synthetic hackathon prototype, not a production document service. It does not include OCR, actual PDF/image redaction, malware scanning, rate limiting, durable distributed sessions, key rotation, retention jobs, upstream logout, or live university integrations. File signature checks validate supported containers, not all possible malformed content. Production deployment would need those controls, HTTPS, managed key custody, backup/restore design, monitoring, and review of the real identity provider configuration. Preserve the AES key alongside encrypted-file backups; changing it makes existing originals unreadable. Only synthetic data belongs in this build.

No hackathon rules were present requiring `summary.doc`; the requested deliverable is `summary.md`. See `DEMO.md` for the two-minute script and `VERIFICATION.md` for actual run results.
