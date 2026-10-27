import { samplePdf, syntheticSamples } from "../lib/samples";
import "dotenv/config";
import { pathToFileURL } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";
import { getDb, databaseBackend } from "../lib/db";
import { storeFile, removeFile } from "../lib/storage";
import { proposalHash } from "../lib/service";
export async function seed() {
  if (
    process.env.AUTH_MODE !== "demo" ||
    process.env.NODE_ENV === "production" ||
    databaseBackend() !== "sqlite" ||
    process.env.VERCEL === "1"
  )
    throw new Error("Synthetic seeding is restricted to local demo mode.");
  const old = await getDb().document.findMany({ select: { storageId: true } });
  await getDb().$transaction([
    getDb().accessEvent.deleteMany(),
    getDb().shareGrant.deleteMany(),
    getDb().shareRequest.deleteMany(),
    getDb().document.deleteMany(),
    getDb().adminChangeRequest.deleteMany(),
    getDb().user.deleteMany(),
    getDb().policy.deleteMany(),
  ]);
  for (const d of old) await removeFile(d.storageId).catch(() => {});
  await getDb().user.createMany({
    data: [
      {
        id: "student-maya",
        subject: "demo:maya",
        email: "maya@students.example.test",
        name: "Maya Chen",
        role: "STUDENT",
        demo: true,
      },
      {
        id: "recipient-campus",
        subject: "demo:campus",
        email: "verify@campusnest.example.test",
        name: "Alex Morgan",
        role: "RECIPIENT",
        organisation: "CampusNest · simulated accommodation",
        demo: true,
      },
      {
        id: "admin-jordan",
        subject: "demo:jordan",
        email: "jordan@trustvault.example.test",
        name: "Jordan Lee",
        role: "ADMINISTRATOR",
        demo: true,
      },
      {
        id: "admin-sam",
        subject: "demo:sam",
        email: "sam@trustvault.example.test",
        name: "Sam Rivera",
        role: "ADMINISTRATOR",
        demo: true,
      },
    ],
  });
  await getDb().policy.create({
    data: { id: "sharing", maxDurationHours: 168, version: 1 },
  });
  const samples = syntheticSamples;
  for (const sample of samples) {
    const bytes = samplePdf(
        sample.title,
        Object.entries(sample.attributes).map(([k, v]) => `${k}: ${v}`),
      ),
      storageId = await storeFile(bytes, "application/pdf");
    await getDb().document.create({
      data: {
        ...sample,
        ownerId: "student-maya",
        mime: "application/pdf",
        size: bytes.length,
        storageId,
        attributeSource:
          "Seeded synthetic attributes - not extracted from an uploaded file",
      },
    });
  }
  await mkdir("examples", { recursive: true });
  await writeFile(
    "examples/synthetic-upload.pdf",
    samplePdf("Synthetic upload demonstration", [
      "Student: Maya Chen (fictional)",
      "Status: Currently enrolled (synthetic)",
      "Upload example only - no automatic attribute extraction",
    ]),
  );
  const common = {
    studentId: "student-maya",
    recipientId: "recipient-campus",
    documentKind: "enrolment",
  };
  await getDb().shareRequest.createMany({
    data: [
      {
        ...common,
        id: "request-reasonable",
        purpose:
          "Verify current student enrolment for a student accommodation application.",
        fields: ["enrolmentStatus", "fullName"],
        durationHours: 24,
      },
      {
        ...common,
        id: "request-excessive",
        purpose:
          "An accommodation portal requests information to verify student status.",
        fields: [
          "enrolmentStatus",
          "passportNumber",
          "homeAddress",
          "insurancePolicyNumber",
        ],
        durationHours: 336,
      },
      ...["active", "expired", "revoked"].map((s) => ({
        ...common,
        id: `request-${s}`,
        purpose:
          "Confirm student status for a simulated accommodation eligibility check.",
        fields: ["enrolmentStatus", "fullName"],
        durationHours: 24,
        status: "APPROVED",
        decidedAt: new Date(Date.now() - 3600000),
      })),
    ],
  });
  for (const state of ["active", "expired", "revoked"])
    await getDb().shareGrant.create({
      data: {
        id: `grant-${state}`,
        requestId: `request-${state}`,
        documentId: "doc-enrolment",
        ownerId: "student-maya",
        recipientId: "recipient-campus",
        approvedFields: ["enrolmentStatus", "fullName"],
        consentAt: new Date(
          Date.now() - (state === "expired" ? 48 : 1) * 3600000,
        ),
        expiresAt: new Date(
          Date.now() + (state === "expired" ? -24 : 23) * 3600000,
        ),
        revokedAt: state === "revoked" ? new Date() : null,
        policyVersion: 1,
      },
    });
  const p = {
    proposerId: "admin-jordan",
    proposedMaxHours: 336,
    previousMaxHours: 168,
    baseVersion: 1,
    reason:
      "Allow up to 14 days for simulated accommodation application reviews.",
  };
  await getDb().adminChangeRequest.create({
    data: { id: "proposal-duration", ...p, proposalHash: proposalHash(p) },
  });
  await getDb().accessEvent.createMany({
    data: [
      {
        actorId: "student-maya",
        ownerId: "student-maya",
        action: "VAULT_READY",
        outcome: "SUCCESS",
        detail: "Three synthetic samples encrypted and stored privately.",
      },
      {
        actorId: "student-maya",
        ownerId: "student-maya",
        action: "CONSENT_GRANTED",
        outcome: "SUCCESS",
        targetId: "grant-active",
        detail: "Sample consent: enrolment confirmation and name only.",
      },
      {
        actorId: "recipient-campus",
        ownerId: "student-maya",
        action: "REQUEST_CREATED",
        outcome: "PENDING",
        targetId: "request-excessive",
        detail: "Accommodation request awaiting review. Nothing shared.",
      },
      {
        actorId: "admin-jordan",
        action: "POLICY_PROPOSED",
        outcome: "PENDING",
        targetId: "proposal-duration",
        detail: "Maximum duration change awaits another administrator.",
      },
    ],
  });
  console.log(
    "Demo reset: 4 identities, 3 encrypted PDFs, 2 pending requests, active/expired/revoked grants, and pending policy proposal.",
  );
  await getDb().$disconnect();
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await seed();
