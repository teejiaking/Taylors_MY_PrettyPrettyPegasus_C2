# Real accounts with Supabase Auth

TrustVault supports real Supabase email/password accounts. The configured project is `umyierhvfoqkgsubuhvs`, at `https://umyierhvfoqkgsubuhvs.supabase.co`. Local settings are stored in ignored `.env`. Hosted deployments also use a server-only secret key for private Storage; this key is never used as the authentication client's publishable key.

Supabase is the identity provider in this mode. On Vercel, PostgreSQL stores documents, consent, roles, policy and audit records in the private `trustvault` schema, and Supabase Storage holds encrypted originals in a private bucket. Local development can retain SQLite and filesystem storage. Follow **[HOSTING.md](HOSTING.md)** for the hosted setup and migration; the local instructions below preserve the existing local data.

## Installation and startup

```powershell
npm ci
npm run setup
```

`setup` creates `.env` with random local keys if it does not exist. It preserves an existing file. Set these entries in `.env`:

```dotenv
AUTH_MODE="supabase"
SUPABASE_URL="https://umyierhvfoqkgsubuhvs.supabase.co"
SUPABASE_PUBLISHABLE_KEY="YOUR_PROJECT_PUBLISHABLE_KEY"
APP_ORIGIN="http://127.0.0.1:3000"
DATABASE_URL="file:./trustvault-supabase.db"
STORAGE_DIR="./private-storage-supabase"
```

Then:

```powershell
npm run db:migrate
npm run build
npm start
```

Open **http://127.0.0.1:3000**. For editing, use `npm run dev`. Local Supabase production builds use `.next-supabase/`, separate from the optional compiled demo. Vercel builds use standard `.next/`; see [HOSTING.md](HOSTING.md) before deploying. Keep the server running. A fresh database gets the seven-day policy via migration and contains no demo users. Existing demo files and `prisma/trustvault.db` are preserved separately on this workspace.

All application auth requests go through same-origin server routes. `SUPABASE_URL` and the publishable key stay in server environment variables in this architecture; neither is a service-role secret. Passwords are submitted to Supabase over HTTPS and are not stored in Prisma or application logs. Supabase session cookies are HttpOnly, SameSite=Lax, Secure for HTTPS, chunked by the official SSR SDK, and excluded from cached responses. Route handlers verify with `getUser()` and propagate refreshed cookies on that same response; the public application shell does not make auth decisions from a browser session object. Because protected data is served by writable route handlers, no separate Server Component auth proxy is required here.

In production use an HTTPS app origin. HTTP is permitted only for the explicit local `127.0.0.1:PORT` origin. On this Windows machine, Node HTTPS requests need the already installed antivirus CA. The running server was started with `NODE_EXTRA_CA_CERTS` pointing to `test-results/local-proxy-ca.pem`. If restarting in a fresh PowerShell terminal on this same machine, use `$env:NODE_EXTRA_CA_CERTS=(Resolve-Path test-results/local-proxy-ca.pem).Path` before `npm start`. That ignored local certificate file is not needed on a machine with a normal trusted TLS connection; do not disable TLS validation.

## Your first account

1. Choose **Create student account**, enter your own email/name and a password of at least 6 characters. The Supabase project's password policy must also allow six-character passwords; its minimum length is configured under Authentication settings.
2. Confirm your email using Supabase's email. The live project reports email confirmation is enabled. If the confirmation returns to a different origin, come back to TrustVault and sign in with the confirmed email and password.
3. For seamless email return, in [Supabase URL Configuration](https://supabase.com/dashboard/project/umyierhvfoqkgsubuhvs/auth/url-configuration), set the Site URL to `http://127.0.0.1:3000` and allow `http://127.0.0.1:3000/auth/callback`. For deployment use the exact HTTPS equivalent. Changes to the project's dashboard settings were not made automatically.
4. Your first successful, server-verified sign-in creates a **Student** mapping keyed by `supabase:<immutable auth user id>`. Email confirmation and non-anonymous identity are required. Existing accounts are never linked by matching email alone.
5. In **Document vault**, choose **Add synthetic samples**. The three fictional Maya Chen documents belong to your real authenticated account. They are not claims about your identity and contain only synthetic attributes. You can also upload synthetic PDFs/PNGs/JPEGs normally.

The active site has no demo identity dropdown. Four real email accounts are needed to demonstrate the student, recipient and two separate administrator identities. Users must sign out and sign into the appropriate account, or use separate browser profiles.

## Recipient and administrator access

Users cannot select or edit their role during signup. TrustVault never trusts Supabase `user_metadata` roles or organisation names. A project operator with local server access assigns staff roles using each account's immutable **Supabase Auth user ID**, available in [Authentication → Users](https://supabase.com/dashboard/project/umyierhvfoqkgsubuhvs/auth/users):

```powershell
npm run auth:provision -- "RECIPIENT-AUTH-UUID" "recipient@example.com" "Recipient Name" RECIPIENT "CampusNest (simulated)"
npm run auth:provision -- "ADMIN-A-AUTH-UUID" "admin-a@example.com" "Admin A" ADMINISTRATOR
npm run auth:provision -- "ADMIN-B-AUTH-UUID" "admin-b@example.com" "Admin B" ADMINISTRATOR
```

Use actual confirmed accounts and their actual IDs/emails. Do not run the literal example values. The CLI automatically prefixes Supabase subjects. Assigned roles are read from Prisma on every protected request, so editable or stale JWT role metadata cannot elevate access. Recipients must have a provisioned organisation; their requests and grants are addressed to their immutable mapped identity. Live recipients cannot submit requests to old demo users. Administrators have no document access and cannot approve their own immutable proposals. Dual approval remains a TrustVault application control, not Supabase-native or TideCloak-native governance.

## Verification and limits

- Live project connection checked: `GET /auth/v1/settings` returned HTTP 200; email provider enabled, signup enabled, automatic email confirmation disabled.
- `npm test`: 39 passing tests. Original document/consent/governance tests plus installed-SDK auth tests, encrypted hosted Storage round trips and fail-closed Vercel persistence checks.
- Production build and typecheck passed. `npm run test:supabase` passed against the running app/live provider without creating users or sending email; it verifies demo login is disabled and invalid credentials cannot authenticate. Browser checks confirmed the sign-in/signup form and absence of demo identities.
- Supabase-specific automated success flows use mocked provider HTTP responses through the actual installed SDK. No real user was created and no confirmation email was sent as a test. Actual successful email confirmation/sign-in requires the user to complete their own account flow.
- Tested package versions: `@supabase/supabase-js` 2.118.0 and `@supabase/ssr` 0.12.7, pinned with the lockfile.
- The tagged Supabase connector returned “tool not available”; dashboard administration uses the user's authenticated Chrome session when needed. Live configuration and deployment must be verified separately from local tests.
- Supabase sign-out revokes the current refresh session and clears its application cookies. Access tokens already copied elsewhere may remain valid until expiry; every document/grant check still independently enforces current server-side permissions and grant revocation. This prototype does not claim immediate global access-token invalidation.
- Email delivery, SMTP quotas, confirmation redirect allowlists, password rules and abuse protection are project configuration. Add CAPTCHA/rate limits and review deployment controls before accepting real sensitive documents; this build remains synthetic-document-only.

Current official references: [SSR client setup and verified user methods](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [password sign-in](https://supabase.com/docs/reference/javascript/auth-signinwithpassword), [sign-up](https://supabase.com/docs/reference/javascript/auth-signup), [redirect configuration](https://supabase.com/docs/guides/auth/redirect-urls). Changelog checked 22 October 2026, including the upcoming TLS cipher deprecation; Node 24 supports the modern TLS used here.
