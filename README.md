# TrustVault

A Next.js app for student documents, selective consent, recipient access and two-person policy review. Real accounts use TideCloak. Supabase is not used.

## Start after the Windows restart

VirtualMachinePlatform must be enabled in administrator PowerShell and Windows must be restarted before Docker Desktop can run. The app does not change Windows features or restart your computer.

With Docker Desktop running:

```powershell
npm ci
npm run tidecloak:start
```

Local settings and random keys have been prepared in ignored .env.local; Docker bootstrap credentials are in ignored .tidecloak/local.env. Preparation preserves existing values. See [TIDECLOAK.md](TIDECLOAK.md) to finish the realm/client setup and sign in.

The interface now uses the real /auth/login, /api/session, document, request, grant, governance and logout endpoints. Private views clear after logout or an expired session. Identity switching and Reset demo appear only when WORKSPACE_MODE=demo is explicitly configured.

## Storage and hosting

Local development uses a separate SQLite database and private encrypted disk. Vercel uses PostgreSQL (for example Neon) and a private Vercel Blob store. Uploaded originals are AES-256-GCM encrypted before storage, and only authenticated owner routes decrypt them. Recipients receive only approved attributes.

Follow [DEPLOYMENT.md](DEPLOYMENT.md) for Neon, private Blob and Vercel configuration. Build commands generate/compile code only; they never apply database migrations. A Vercel deployment requires a publicly reachable HTTPS TideCloak server. The local Docker instance is for development.

## Checks

```powershell
npm test
npm run test:server
npm run typecheck
npm run build
npm run auth:doctor
```

Tests exercise real server authorization, token verification with signed fixtures, PKCE/state/cookies, encrypted storage, consent, expiry, revocation, independent approval, and client request handling. Cloud Blob requests are mocked. Live TideCloak enrollment and live Neon/Blob checks require your configured services and are not claimed by these tests.

## Optional browser demo

Set WORKSPACE_MODE=demo in the server environment, then start or restart the app. This explicitly selected mode uses fictional identities and in-memory records that reset on reload. It cannot access authenticated server operations. It is not a fallback for failed real sign-in.

Upload limits are 5 MB locally/in the demo and 4 MB for Vercel server uploads, leaving room for multipart overhead under Vercel's request limit. Uploads do not automatically extract attributes; labelled fictional samples demonstrate selective sharing. Guardian is rules-based advice. The sharing-duration policy uses application-level dual approval, not TideCloak's native IAM governance.

Use synthetic documents only. See [DEMO.md](DEMO.md) and [summary.md](summary.md).
