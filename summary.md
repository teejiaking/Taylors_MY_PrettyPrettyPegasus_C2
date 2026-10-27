# TrustVault

TrustVault demonstrates student document custody, selective consent, revocable recipient access and application-level two-person policy approval.

The app interface is connected to TideCloak sign-in, verified server sessions, authenticated vault operations and app logout. Passwords are entered on TideCloak; tokens remain in HttpOnly cookies. Unknown subjects and mismatched roles fail closed. The browser identity selector is available only in explicitly selected demo mode.

Vercel hosting uses PostgreSQL (for example Neon) for records and a private Vercel Blob store for AES-256-GCM encrypted original files. Local development can use SQLite and private disk. Supabase is not used. Builds do not apply database migrations.

The rules-based Guardian flags potentially excessive requested attributes. Students approve selected fields and a bounded duration. Recipients receive approved attributes only; server access checks expiry, revocation and current policy. A different administrator must review a policy proposal before it changes the applied version.

Uploads do not extract or verify document attributes; labelled fictional samples demonstrate selective sharing. Real mode persists account records and files. Explicit demo mode uses fictional in-memory identities and resets on reload. This app does not claim Tide-native end-to-end encryption or native Tide IAM governance for its application policy.

Code and fixture tests are available. Live TideCloak setup requires enabling Windows VirtualMachinePlatform, restarting and completing the realm/client enrollment. Hosted use additionally requires your Neon/private Blob credentials and a publicly reachable HTTPS TideCloak server. See README.md, TIDECLOAK.md, DEPLOYMENT.md and DEMO.md. Use synthetic documents only.
