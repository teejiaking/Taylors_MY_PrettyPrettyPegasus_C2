# Optional TideCloak integration

The deployed website is the browser demo described in README.md. Its identity selector is a simulation and does not authenticate against TideCloak. No TideCloak settings are needed to deploy that demo.

The repository preserves the original server-side TideCloak integration:

- lib/auth.ts verifies tokens through the installed @tidecloak/nextjs SDK and checks issuer, client, expiry, provisioned user mapping and matching realm role.
- app/auth/[action]/route.ts provides authorization-code sign-in with signed state and PKCE, a callback, and an HttpOnly cookie.
- app/api/[...path]/route.ts and lib/service.ts retain local authenticated document, consent, recipient and governance operations.
- SQLite migrations, private AES-256-GCM file storage, subject provisioning, and 26 local security/integration checks remain available.

## Local configuration

Use Node.js 24.x and persistent private disk. Run npm ci, then npm run setup:server to create an ignored .env with generated session and document keys. Existing .env files are preserved; review their auth mode and local paths before using this integration.

Set AUTH_MODE=tidecloak and configure the server-only values from .env.example: APP_ORIGIN, TIDECLOAK_ISSUER, TIDECLOAK_CLIENT_ID, TIDECLOAK_CLIENT_SECRET and TIDECLOAK_CONFIG_JSON. Use the SDK adapter JSON downloaded for your actual realm client. Allow the exact APP_ORIGIN/auth/callback URL in that client. Keep all credentials out of Git and chat.

Use a separate local SQLite DATABASE_URL and STORAGE_DIR. Run npm run db:migrate for that database. Provision each immutable realm subject with a matching role:

```sh
npm run auth:provision -- REAL-SUBJECT student@example.test "Student Name" STUDENT
npm run auth:provision -- RECIPIENT-SUBJECT recipient@example.test "Recipient Name" RECIPIENT "Organisation Name"
```

The local /auth/login endpoint starts TideCloak sign-in; /api/session reports the verified server session. The main website remains the browser demo and does not consume that session. Connecting the full UI to real accounts is a separate change. Real hosted sign-in and document workflows would also require persistent application storage and a reachable TideCloak server; SQLite/private local files are deliberately unavailable on Vercel.

## Verify

Run npm run test:server. Tests use a separate test database and synthetic storage, exercise the installed token verifier with locally generated signed-token fixtures, and check authorization, PKCE/state, encryption, consent and independent governance. They do not claim a live sign-in to a configured external realm.
