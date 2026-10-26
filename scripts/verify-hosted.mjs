import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/trustvault-postgres";

const connection = new URL(
  process.env.SUPABASE_MIGRATION_DATABASE_URL ||
    process.env.SUPABASE_DATABASE_URL,
);
connection.searchParams.set("schema", "trustvault");
if (!connection.searchParams.has("sslmode"))
  connection.searchParams.set("sslmode", "require");
const db = new PrismaClient({ datasourceUrl: connection.toString() });
const rollback = new Error("Roll back synthetic verification records.");
const marker = "verify-" + randomUUID();
const ids = [marker + "-student", marker + "-admin-a", marker + "-admin-b"];
try {
  const tables =
    await db.$queryRaw`SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'trustvault' AND tablename IN ('users','documents','share_requests','share_grants','access_events','admin_change_requests','policies')`;
  assert.equal(tables.length, 7, "All application tables must exist.");
  assert.ok(
    tables.every((table) => table.rowsecurity),
    "Every application table must have RLS enabled.",
  );
  const [access] =
    await db.$queryRaw`SELECT has_schema_privilege('anon', 'trustvault', 'USAGE') AS anonymous, has_schema_privilege('authenticated', 'trustvault', 'USAGE') AS authenticated`;
  assert.equal(access.anonymous, false);
  assert.equal(access.authenticated, false);
  try {
    await db.$transaction(
      async (tx) => {
        const policy = await tx.policy.findUniqueOrThrow({
          where: { id: "sharing" },
        });
        assert.ok(
          policy.maxDurationHours >= 1 && policy.maxDurationHours <= 720,
        );
        await tx.user.createMany({
          data: ids.map((id, index) => ({
            id,
            subject: id,
            email: id + "@example.test",
            name: "Synthetic build verification",
            role: index === 0 ? "STUDENT" : "ADMINISTRATOR",
            demo: true,
          })),
        });
        const document = await tx.document.create({
          data: {
            ownerId: ids[0],
            title: "Synthetic verification",
            kind: "enrolment",
            mime: "application/pdf",
            size: 10,
            storageId: randomUUID(),
            attributes: {},
            attributeSource: "Build verification; no stored file",
          },
        });
        const request = await tx.shareRequest.create({
          data: {
            studentId: ids[0],
            recipientId: ids[1],
            purpose: "Synthetic database verification",
            fields: ["enrolmentStatus"],
            documentKind: "enrolment",
            durationHours: 1,
          },
        });
        await tx.shareRequest.update({
          where: { id: request.id },
          data: { status: "APPROVED", decidedAt: new Date() },
        });
        await tx.shareGrant.create({
          data: {
            requestId: request.id,
            documentId: document.id,
            ownerId: ids[0],
            recipientId: ids[1],
            approvedFields: ["enrolmentStatus"],
            expiresAt: new Date(Date.now() + 3600000),
            policyVersion: policy.version,
          },
        });
        await tx.accessEvent.create({
          data: {
            actorId: ids[0],
            ownerId: ids[0],
            action: "BUILD_VERIFICATION",
            outcome: "SUCCESS",
            detail: "Synthetic transaction, rolled back before deployment.",
          },
        });
        const proposal = await tx.adminChangeRequest.create({
          data: {
            proposerId: ids[1],
            proposedMaxHours: policy.maxDurationHours === 24 ? 48 : 24,
            previousMaxHours: policy.maxDurationHours,
            baseVersion: policy.version,
            reason: "Synthetic governance verification",
            proposalHash: "0".repeat(64),
          },
        });
        async function mustReject(work, message) {
          await tx.$executeRawUnsafe("SAVEPOINT verify_guard");
          await assert.rejects(work, message);
          await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT verify_guard");
          await tx.$executeRawUnsafe("RELEASE SAVEPOINT verify_guard");
        }
        await mustReject(
          () =>
            tx.adminChangeRequest.update({
              where: { id: proposal.id },
              data: { reviewerId: ids[1], status: "APPLIED" },
            }),
          /Independent final decision/,
        );
        await mustReject(
          () =>
            tx.adminChangeRequest.update({
              where: { id: proposal.id },
              data: { reason: "Edited" },
            }),
          /Proposal is immutable/,
        );
        await mustReject(
          () =>
            tx.shareRequest.update({
              where: { id: request.id },
              data: { status: "PENDING" },
            }),
          /Invalid request transition/,
        );
        await tx.adminChangeRequest.update({
          where: { id: proposal.id },
          data: {
            reviewerId: ids[2],
            status: "APPLIED",
            decidedAt: new Date(),
            appliedAt: new Date(),
          },
        });
        await tx.policy.update({
          where: { id: "sharing" },
          data: {
            maxDurationHours: proposal.proposedMaxHours,
            version: { increment: 1 },
          },
        });
        throw rollback;
      },
      { timeout: 20000 },
    );
  } catch (error) {
    if (error !== rollback) throw error;
  }
  assert.equal(
    await db.user.count({ where: { id: { in: ids } } }),
    0,
    "Synthetic verification data must be rolled back.",
  );
  console.log(
    "Hosted verification passed: seven private RLS tables, Prisma queries, governance guards, and rolled-back synthetic transaction.",
  );
} finally {
  await db.$disconnect();
}
