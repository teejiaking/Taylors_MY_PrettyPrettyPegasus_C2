# TideCloak setup without Supabase

The interface is now connected to server authentication. Real mode is the default. Missing credentials show a setup message and never silently select a demo identity.

## 1. Enable Docker on Windows

Save your work. In administrator PowerShell run the VirtualMachinePlatform command shown by Docker, then restart Windows fully. Start Docker Desktop and wait for its Linux engine to be running. No app script changes Windows features or restarts Windows.

Run npm run tidecloak:start from this repository. If you are setting up another checkout, run npm run tidecloak:prepare first. This prepares ignored local settings, generates random keys, and stores the Docker bootstrap password in .tidecloak/local.env. It does not overwrite existing .env.local values or delete Docker volumes.

Open http://localhost:8080. Use username admin and read the password locally from .tidecloak/local.env. Do not paste it into chat or Git. Complete TideCloak's realm setup wizard yourself, including its terms and Tide account enrollment. Choose trustvault as the realm/project name if available; otherwise use the actual realm name consistently below.

Official instructions: https://docs.tide.org/Admin/Quick-deploy-test

## 2. Register the app

In your realm's tide-console, register an OIDC client named trustvault. Enable the standard authorization-code flow, confidential client authentication and PKCE S256 for the server adapter used here. Set the exact local callback to http://127.0.0.1:3000/auth/callback and the local web origin to http://127.0.0.1:3000. For production add the exact HTTPS app origin and its /auth/callback URL; do not use a wildcard production redirect.

Create or grant the application roles student, recipient and administrator as appropriate, completing any TideCloak governance approvals required by your realm. Download the Tide adapter JSON, including its JWK configuration, for this client.

Edit the ignored .env.local:

- WORKSPACE_MODE=tidecloak and AUTH_MODE=tidecloak.
- APP_ORIGIN=http://127.0.0.1:3000 for development.
- TIDECLOAK_ISSUER=http://localhost:8080/realms/trustvault, adjusted to your actual realm.
- TIDECLOAK_CLIENT_ID=trustvault.
- TIDECLOAK_CLIENT_SECRET: the confidential client's secret, kept server-only.
- TIDECLOAK_CONFIG_JSON: the downloaded adapter JSON, on one line enclosed in single quotes. Its realm, resource and auth-server-url must match the issuer and client.

Keep the generated SESSION_SECRET and DOCUMENT_ENCRYPTION_KEY. The latter must remain unchanged to read previously encrypted documents.

## 3. Map real accounts and run

The local SQLite schema has been initialized in a separate trustvault-tidecloak.db file. On a new checkout run npm run db:migrate. No demo identities are seeded into this database.

Obtain each user's immutable subject/ID from your realm, then provision the matching application role:

```powershell
npm run auth:provision -- REAL-SUBJECT student@example.test "Student Name" STUDENT
npm run auth:provision -- RECIPIENT-SUBJECT recipient@example.test "Recipient Name" RECIPIENT "Organisation"
npm run auth:provision -- ADMIN-SUBJECT admin@example.test "Administrator Name" ADMINISTRATOR
npm run auth:doctor -- --connect
npm run dev
```

Open http://127.0.0.1:3000 and choose Sign in with TideCloak. You enter your password on TideCloak. Returning to the app creates an HttpOnly app cookie only after verifying the token and subject/role mapping. Each API request rechecks the signed token and authorization. The UI does not use the browser simulation in this mode.

Unknown/unprovisioned identities fail closed; roles are never accepted from a submitted form. Expired sessions require another sign-in. Sign out clears TrustVault's cookies and private views; it does not terminate the upstream TideCloak SSO session.

Local HTTP is allowed for development loopback only. A production build requires HTTPS for both the app and TideCloak. Use npm run dev for the local HTTP server.

## 4. Vercel

Follow DEPLOYMENT.md. Localhost is not reachable from Vercel or other visitors: deploy TideCloak separately with persistent storage and an HTTPS domain before enabling real hosted sign-in. Complete the same realm/client mapping and configure Vercel's server environment. No Supabase service or SDK is required.

## Verification boundaries

npm run test:server exercises the installed TideCloak verifier and full server cookie/session routes with signed test fixtures. It is not a successful live enrollment or sign-in to your realm. Docker startup remains blocked until the Windows feature/restart requirement is resolved.
