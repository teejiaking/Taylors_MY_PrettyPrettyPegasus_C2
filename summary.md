# TrustVault

A student document-sharing hackathon demo built with Next.js, React and TypeScript.

The website opens immediately without sign-in or external services. It includes a dashboard, three fictional sample documents, upload/preview, excessive-request guidance, selected-field consent, recipient viewing, expiry, revocation, governance proposals and an activity log. A header selector switches between Maya (student), Alex (recipient), Jordan and Sam (independent administrators).

The rules-based Guardian recommends the minimum attributes needed for a stated purpose. Consent is explicit and time limited. Recipient access projects approved attributes only and checks the current grant state and sharing policy. A policy proposal requires a different demo administrator's approval and can be applied only once.

The default deployment runs entirely in the current browser tab. All records and files reset on reload, close or Reset demo. Visitors have separate workspaces. There is no real authentication, cross-device sharing, remote persistence, OCR, PDF redaction, or server encryption in this mode. Uploaded files do not supply extracted attributes; the labelled fictional samples demonstrate selective sharing.

Supabase integration has been removed. Vercel builds run Next.js only and never connect to a database or perform migrations. The optional local TideCloak verifier, OIDC/PKCE routes, authorization services and encrypted SQLite/private-disk backend remain in the repository with their integration tests; they are disabled on Vercel.

See README.md for setup and Vercel deployment, TIDECLOAK.md for the optional integration, and DEMO.md for the two-minute walkthrough. Use synthetic data only.
