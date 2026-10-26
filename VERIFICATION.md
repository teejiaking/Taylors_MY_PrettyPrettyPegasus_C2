# TrustVault verification

## Deployed sign-in redirect fix — 26 October 2026

- Reproduced the issue on `https://trustvault-odin.vercel.app`: the session endpoint reported `authMode=unconfigured` with `configured=true`, while `/auth/login` redirected to `http://127.0.0.1:3000/?authError=1`.
- Supabase code, packages and local configuration are preserved. No provider accounts, secrets or hosted environment settings were changed.
- Missing providers now report `configured=false`. The UI offers TideCloak sign-in only when TideCloak is selected and its settings are valid; a failed session request shows a retry screen.
- Authentication failures remain on the requesting website. A mismatched `APP_ORIGIN` produces an error on that website instead of redirecting to localhost.
- `npm test`: 36 passing tests. Added coverage includes missing settings, a deployed request with a localhost origin setting, and a simulated TideCloak authorization-code callback with state/PKCE checks, signed-token verification, and secure session cookies. Supabase login/session tests still pass.
- Production build passed after retrying with host permissions for a Windows build-directory permission error. Live TideCloak sign-in still requires an actual realm, client configuration and provisioned subject mappings; none was provided for the Vercel deployment.

Run on 22 October 2026 on Windows with Node.js 24.16.0. These are actual results, not planned checks.

## Public browsing update

- `npm test`: 32 passed, including unauthenticated route checks for private overview, document preview, grant access, sample uploads, requests and policy proposals. Private endpoints still return 401 and sensitive reads retain no-store headers.
- `npm run typecheck` and `npm run build`: passed.
- Browser: an unsigned visitor sees the guest workspace first. The example request approves enrolment only, the recipient preview displays exactly that field, and revocation denies the next access and removes the attribute view. Optional sign-in and return to public browsing work. At the 390 × 844 phone breakpoint, navigation opens, document examples remain accessible, and there is no horizontal overflow.
- Signup now accepts six-character passwords and rejects five at the application boundary; the automated signup provider response is a fixture. Supabase's own project policy remains applicable.
- The guest exercise uses public fictional data and local component state. It creates no real grants and does not test a deployed Vercel database/storage migration.

## Supabase real-account update (initial verification)

The expanded `npm test` suite now has **32 passing tests**. Added checks cover server-side `getUser` verification, default Student provisioning, ignored editable role metadata, rejection of unconfirmed/anonymous users and email collisions, password session cookies/logout, forged-cookie rejection, refresh-cookie rotation, signup confirmation, misconfiguration/service-role rejection and real-account ownership of synthetic samples. Success-flow provider HTTP responses are fixtures passed through the installed official SDK; no live user was created during automation. The actual configured project's Auth settings returned **HTTP 200**, with email signup enabled and confirmation required. SQLite real-account migrations were applied to `prisma/trustvault-supabase.db`, separate from demo/test data. See SUPABASE.md for details.

The Supabase build and `npm run typecheck` passed. **`npm run test:supabase` passed against the running compiled app and actual Supabase Auth service**: real-provider mode and configured state, no demo identities, demo login 403, protected anonymous requests 401, invalid signup input 400 before provider/email calls, and invalid login credentials 401 from the live Auth path. Browser inspection confirmed the real-account sign-in/create-account screen, required 12-character signup passwords, and no demo identity switcher. No valid signup or email confirmation was automated; those are completed by the account owner. An initial restricted-sandbox build directory error was resolved by creating the generated webpack directory and rerunning the build with normal host permissions.

## Original offline-demo verification

| Check | Result |
| --- | --- |
| SQLite migrations and repeatable seed | Passed; both committed migrations applied; four identities, three encrypted PDFs, two pending requests, active/expired/revoked sample grants and one pending policy proposal. |
| `npm test` | **23 passed, 0 failed, 0 skipped.** Isolated test database/storage. |
| `npm run typecheck` | Passed. |
| `npm run build` | Passed on pinned Next.js 16.2.12 with webpack, including static generation and TypeScript checking. |
| `npm run test:http` against final compiled demo | Passed. Uses real HTTP requests and session cookies, not service mocks. |
| Another student accesses an original | Denied, 404. Recipient and administrator originals also denied. |
| Unrelated recipient accesses a grant | Denied, 403, with audit event. |
| Approved-attribute response | Exact approved keys only; no passport, address, insurance identifier, storage identifier, other student attributes or original file contents. |
| Expired and revoked access | Denied on the next request, including after successful access followed by revocation. |
| Uploads | Valid synthetic PDF accepted through service, HTTP and browser; unsupported text, forged MIME/signature, empty and oversized bytes rejected. PNG/JPEG signature acceptance checked. |
| Encryption | Disk bytes contain no sample passport plaintext; modified ciphertext fails GCM authentication; traversal storage identifiers rejected. |
| Session/origin checks | Forged/missing sessions and cross-origin mutations denied. Roles come from database and verified token claims. |
| Guardian seeded assessment | High risk; passport number, home address and insurance policy number flagged; only enrolment suggested; duration 24 hours; explicitly rules-based. |
| Governance | Pending policy unchanged; self-approval denied; second administrator applies once; duplicate decision denied; rejected proposal leaves policy unchanged; later grants use new policy; current policy is rechecked on access. |
| Immutable proposal | Database trigger rejects edits to content after submission. |
| TideCloak verifier | Installed official SDK validates locally signed EdDSA tokens; wrong signature, issuer, client, expiry and role rejected. This is not a live TideCloak/Fabric integration test. |
| Default production demo disablement | Service test and an actual `npm start -- --port 3001` check passed: `/api/session` returned no demo identities; demo login returned 403. Temporary production-check server then stopped. |
| Loopback compiled-demo opt-in | Restricted origin tested; actual HTTP request with an unexpected Host returned 403. Launcher also checks the socket address. |

Browser walkthrough using the in-app browser:

- Signed in as the synthetic student; reviewed the accommodation Guardian assessment; only enrolment was preselected; shortened duration to 12 hours and approved.
- Signed in as CampusNest's recipient; saw only “Enrolment confirmation: Currently enrolled.”
- Revoked as the student; next recipient access displayed “Grant is revoked.”
- Jordan saw a pending 7-day to 14-day change with no self-approval control; Sam independently approved; the interface showed 14 days, one applied change and an audit event.
- Selected `examples/synthetic-upload.pdf` through the file picker and uploaded it successfully; server returned 201 and persisted an encrypted document with no extracted attributes.
- Inspected desktop and narrow mobile layouts, used the mobile navigation drawer, and corrected offscreen navigation accessibility and scroll restoration.

The initial Turbopack build failed on Windows worker creation. Webpack compiled successfully. Next dev also intermittently read an incomplete framework manifest on this Windows/OneDrive/antivirus host. The final presentation uses a compiled `npm run demo` server, avoiding hot-reload manifest writes. Its HTTP smoke test passed. Default production startup remains separate from this explicit loopback-only demo launcher. No real TideCloak server or credentials were available, so live SSO, real subject provisioning, advanced SWE/DPoP exchange, Fabric encryption and native QEA were not demonstrated.

Verification screenshots are local ignored artifacts under `test-results/`. Demo data is reset after verification for presentation.
