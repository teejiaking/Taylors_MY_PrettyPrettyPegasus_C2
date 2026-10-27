# TrustVault: two-minute demonstration

For the synthetic walkthrough, explicitly set WORKSPACE_MODE=demo and run npm ci and npm run dev, or use a deployment configured in that mode. No account is needed for this mode. The app opens as Maya. Real TideCloak mode uses actual accounts and the server workflows instead; see TIDECLOAK.md. Use Reset demo before presenting; all data is synthetic and held in this tab's memory.

| Time | Action and narration |
| --- | --- |
| 0:00–0:15 | Show Maya's document vault: three fictional documents. Explain that the browser demo needs no sign-in. |
| 0:15–0:30 | Upload examples/synthetic-upload.pdf with a title, then preview it. Files stay in this tab and are cleared on reload. Uploaded files have no extracted attributes. |
| 0:30–0:55 | Open the excessive CampusNest request. Guardian flags passport, address and insurance identifiers. Approve only enrolment confirmation for 12 hours. |
| 0:55–1:15 | Switch to Alex Morgan with the header selector. Open the new grant in Recipient portal. Only the selected enrolment attribute is displayed. |
| 1:15–1:35 | Switch to Maya, revoke the new grant from Sharing centre, then switch to Alex and Check access. Access is denied and recorded. Seeded expired and revoked grants also deny access. |
| 1:35–1:55 | Switch to Jordan and open Governance. The proposal is still pending; Jordan cannot approve their own proposal. Switch to Sam and Approve & apply. The policy changes from seven to fourteen days. |
| 1:55–2:00 | Show Activity log. Explain that identities and two-person approval are simulated in this tab. Reload or Reset demo restores the examples. |

This is a browser demonstration, not a real multi-user document service. Guardian uses deterministic rules. Approved attributes come from labelled fictional sample documents, not PDF redaction or OCR. Revocation blocks later demo access; it cannot erase information already viewed.
