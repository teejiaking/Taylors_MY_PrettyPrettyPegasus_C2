# TrustVault

A browser demo of student document custody, selective consent, revocable recipient access and two-person policy review.

## Run locally

Requires Node.js 24.x and npm. No accounts, credentials, databases or environment variables are needed.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:3000. The app starts as Maya Chen with three fictional documents. Use the header selector to try Alex (recipient), Jordan (administrator/proposer), and Sam (independent reviewer). See [DEMO.md](DEMO.md) for the walkthrough and [summary.md](summary.md) for the project overview.

Upload and preview synthetic PDF/PNG/JPEG files up to 5 MB, create requests, review Guardian suggestions, grant selected attributes, view as the recipient, revoke access, and independently approve or reject policy changes. Uploaded files do not automatically provide attributes; the three labelled fictional samples demonstrate selective sharing.

## Deploy on Vercel

Import this repository with the Next.js preset, repository root, Node.js 24.x, Install Command npm ci, Build Command npm run build, and Output Directory .next. No application environment variables are required. The compatibility script scripts/vercel-build.mjs is retained for existing dashboard build-command overrides and only runs Next.js.

Supabase and its hosted migrations are removed. TideCloak remains as an optional local server integration, disabled on Vercel; see [TIDECLOAK.md](TIDECLOAK.md). The deployed browser demo does not use server authentication or database storage. Existing remote data and ignored local files have not been changed.

## Data lifetime

Files and actions stay in the current tab's memory. Reloading, closing the tab or Reset demo clears them and restores the starting examples. Visitors cannot synchronize or share records across tabs/devices. The identity selector simulates roles; it is not authentication. There is no server encryption, OCR or PDF redaction. Use synthetic data only.

## Check and build

```sh
npm test
npm run typecheck
npm run build
npm start
```

Run npm run test:server to check the retained local TideCloak, authorization and encrypted-storage integration against a separate test database. The optional Prisma client is generated on install without connecting to a database; the build never runs database migrations.

The workflow tests cover selected-field consent, replay rejection, recipient projection, expiry, revocation, upload validation and preview bytes, independent policy approval, reset and visitor isolation.
