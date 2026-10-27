import { createHash } from "node:crypto";
import type { User, Prisma } from "@prisma/client";
import { z } from "zod";
import { getDb } from "./db";
import { requireRole } from "./auth";
import {
  AppError,
  MAX_FILE_SIZE,
  readFilePrivate,
  storeFile,
  removeFile,
} from "./storage";
import { assess, fieldNames } from "./guardian";
import { samplePdf, syntheticSamples } from "./samples";
const fieldsSchema = z
  .array(z.enum(fieldNames as [string, ...string[]]))
  .min(1)
  .max(8)
  .refine(
    (x) => new Set(x).size === x.length,
    "Duplicate fields are not allowed",
  );
export async function addSamples(user: User) {
  requireRole(user, "STUDENT");
  if (
    await getDb().document.count({
      where: {
        ownerId: user.id,
        attributeSource: { startsWith: "Seeded synthetic" },
      },
    })
  )
    throw new AppError(409, "Your vault already contains synthetic samples.");
  const stored: string[] = [];
  try {
    const prepared: Prisma.DocumentCreateManyInput[] = [];
    for (const sample of syntheticSamples) {
      const bytes = samplePdf(
        sample.title,
        Object.entries(sample.attributes).map(([k, v]) => `${k}: ${v}`),
      );
      const storageId = await storeFile(bytes, "application/pdf");
      stored.push(storageId);
      prepared.push({
        ownerId: user.id,
        title: sample.title,
        kind: sample.kind,
        attributes: sample.attributes,
        mime: "application/pdf",
        size: bytes.length,
        storageId,
        attributeSource:
          "Seeded synthetic attributes - fictional Maya Chen; not extracted from an uploaded file",
      });
    }
    await getDb().$transaction(async (tx) => {
      if (
        await tx.document.count({
          where: {
            ownerId: user.id,
            attributeSource: { startsWith: "Seeded synthetic" },
          },
        })
      )
        throw new AppError(409, "Synthetic samples already exist.");
      await tx.document.createMany({ data: prepared });
      await tx.accessEvent.create({
        data: {
          actorId: user.id,
          ownerId: user.id,
          action: "SYNTHETIC_SAMPLES_ADDED",
          outcome: "SUCCESS",
          detail:
            "Three fictional sample documents encrypted for this authenticated student.",
        },
      });
    });
    return { created: 3 };
  } catch (error) {
    await Promise.all(stored.map((id) => removeFile(id).catch(() => {})));
    throw error;
  }
}
export async function event(
  actorId: string | null,
  ownerId: string | null,
  action: string,
  outcome: string,
  targetId: string | null,
  detail: string,
) {
  return getDb().accessEvent.create({
    data: { actorId, ownerId, action, outcome, targetId, detail },
  });
}
export function grantState(g: { revokedAt: Date | null; expiresAt: Date }) {
  return g.revokedAt
    ? "REVOKED"
    : g.expiresAt.getTime() <= Date.now()
      ? "EXPIRED"
      : "ACTIVE";
}
const userSelect = { id: true, name: true, email: true, organisation: true };
export async function overview(user: User) {
  const policy = await getDb().policy.findUniqueOrThrow({
    where: { id: "sharing" },
  });
  const activity = await getDb().accessEvent.findMany({
    where:
      user.role === "STUDENT"
        ? { ownerId: user.id }
        : user.role === "ADMINISTRATOR"
          ? { action: { startsWith: "POLICY_" } }
          : { actorId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const base = {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      organisation: user.organisation,
    },
    policy,
    activity,
  };
  if (user.role === "STUDENT") {
    const [documents, requests, grants] = await Promise.all([
      getDb().document.findMany({
        where: { ownerId: user.id },
        select: {
          id: true,
          title: true,
          kind: true,
          mime: true,
          size: true,
          attributes: true,
          attributeSource: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      }),
      getDb().shareRequest.findMany({
        where: { studentId: user.id },
        include: { recipient: { select: userSelect } },
        orderBy: { createdAt: "desc" },
      }),
      getDb().shareGrant.findMany({
        where: { ownerId: user.id },
        include: {
          recipient: { select: userSelect },
          document: { select: { title: true } },
          request: { select: { purpose: true } },
        },
        orderBy: { consentAt: "desc" },
      }),
    ]);
    return {
      ...base,
      documents,
      requests: requests.map((r) => ({
        ...r,
        guardian: assess(r.purpose, r.fields as string[], r.durationHours),
      })),
      grants: grants.map((g) => ({ ...g, state: grantState(g) })),
    };
  }
  if (user.role === "RECIPIENT") {
    const [requests, grants, students] = await Promise.all([
      getDb().shareRequest.findMany({
        where: { recipientId: user.id },
        orderBy: { createdAt: "desc" },
      }),
      getDb().shareGrant.findMany({
        where: { recipientId: user.id },
        select: {
          id: true,
          approvedFields: true,
          expiresAt: true,
          revokedAt: true,
          consentAt: true,
          document: { select: { title: true } },
          request: { select: { purpose: true } },
          owner: { select: { name: true } },
        },
        orderBy: { consentAt: "desc" },
      }),
      getDb().user.findMany({
        where: { role: "STUDENT", demo: user.demo },
        select: { id: true, name: true },
      }),
    ]);
    return {
      ...base,
      requests,
      grants: grants.map((g) => ({ ...g, state: grantState(g) })),
      students,
    };
  }
  requireRole(user, "ADMINISTRATOR");
  const proposals = await getDb().adminChangeRequest.findMany({
    include: {
      proposer: { select: userSelect },
      reviewer: { select: userSelect },
    },
    orderBy: { createdAt: "desc" },
  });
  return { ...base, proposals };
}
export async function upload(
  user: User,
  file: File,
  title: string,
  kind: string,
) {
  requireRole(user, "STUDENT");
  if (file.size > MAX_FILE_SIZE)
    throw new AppError(
      400,
      `Maximum file size is ${MAX_FILE_SIZE / (1024 * 1024)} MB.`,
    );
  const parsed = z
    .object({
      title: z.string().trim().min(2).max(100),
      kind: z.enum(["enrolment", "passport", "insurance", "other"]),
    })
    .parse({ title, kind });
  const bytes = Buffer.from(await file.arrayBuffer()),
    storageId = await storeFile(bytes, file.type);
  try {
    return await getDb().$transaction(async (tx) => {
      const doc = await tx.document.create({
        data: {
          ownerId: user.id,
          ...parsed,
          mime: file.type,
          size: bytes.length,
          storageId,
          attributes: {},
          attributeSource: "Uploaded file • contents not extracted or verified",
        },
      });
      await tx.accessEvent.create({
        data: {
          actorId: user.id,
          ownerId: user.id,
          action: "DOCUMENT_UPLOAD",
          outcome: "SUCCESS",
          targetId: doc.id,
          detail: "Synthetic file encrypted and added to private vault.",
        },
      });
      return { id: doc.id };
    });
  } catch (e) {
    await removeFile(storageId);
    throw e;
  }
}
export async function preview(user: User, id: string) {
  const doc = await getDb().document.findUnique({ where: { id } });
  if (user.role !== "STUDENT" || !doc || doc.ownerId !== user.id) {
    await event(
      user.id,
      null,
      "DOCUMENT_PREVIEW",
      "DENIED",
      id,
      "Owner-only document access denied.",
    );
    throw new AppError(404, "Document unavailable.");
  }
  const bytes = await readFilePrivate(doc.storageId);
  await event(
    user.id,
    user.id,
    "DOCUMENT_PREVIEW",
    "SUCCESS",
    id,
    "Owner viewed private document.",
  );
  return { bytes, mime: doc.mime };
}
export async function createRequest(user: User, input: unknown) {
  requireRole(user, "RECIPIENT");
  if (!user.organisation)
    throw new AppError(403, "Recipient organisation is not provisioned.");
  const data = z
    .object({
      studentId: z.string().min(1),
      purpose: z.string().trim().min(12).max(500),
      fields: fieldsSchema,
      documentKind: z.enum(["enrolment", "passport", "insurance"]),
      durationHours: z.number().int().min(1).max(720),
    })
    .parse(input);
  const student = await getDb().user.findFirst({
    where: { id: data.studentId, role: "STUDENT", demo: user.demo },
  });
  if (!student) throw new AppError(404, "Student not found.");
  return getDb().$transaction(async (tx) => {
    const request = await tx.shareRequest.create({
      data: { ...data, recipientId: user.id },
    });
    await tx.accessEvent.create({
      data: {
        actorId: user.id,
        ownerId: student.id,
        action: "REQUEST_CREATED",
        outcome: "PENDING",
        targetId: request.id,
        detail: "Simulated recipient submitted a request. Nothing shared.",
      },
    });
    return { id: request.id };
  });
}
export async function decideRequest(user: User, id: string, input: unknown) {
  requireRole(user, "STUDENT");
  const data = z
    .object({
      decision: z.enum(["APPROVE", "REJECT"]),
      fields: fieldsSchema.optional(),
      durationHours: z.number().int().min(1).max(720).optional(),
    })
    .parse(input);
  return getDb().$transaction(async (tx) => {
    const request = await tx.shareRequest.findUnique({ where: { id } });
    if (!request || request.studentId !== user.id)
      throw new AppError(404, "Request unavailable.");
    if (request.status !== "PENDING")
      throw new AppError(409, "This request has already been decided.");
    const now = new Date();
    if (data.decision === "REJECT") {
      await tx.shareRequest.update({
        where: { id },
        data: { status: "REJECTED", decidedAt: now },
      });
      await tx.accessEvent.create({
        data: {
          actorId: user.id,
          ownerId: user.id,
          action: "REQUEST_REJECTED",
          outcome: "SUCCESS",
          targetId: id,
          detail: "Request declined. No information shared.",
        },
      });
      return { status: "REJECTED" };
    }
    if (!data.fields || !data.durationHours)
      throw new AppError(400, "Select fields and an access duration.");
    if (data.fields.some((f) => !(request.fields as string[]).includes(f)))
      throw new AppError(400, "Only requested fields can be approved.");
    const policy = await tx.policy.findUniqueOrThrow({
      where: { id: "sharing" },
    });
    if (
      data.durationHours >
      Math.min(request.durationHours, policy.maxDurationHours)
    )
      throw new AppError(
        400,
        "Duration exceeds the request or current sharing policy.",
      );
    const docs = await tx.document.findMany({
      where: { ownerId: user.id },
      orderBy: { createdAt: "asc" },
    });
    const grouped = new Map<
      string,
      { doc: (typeof docs)[number]; fields: string[] }
    >();
    for (const field of data.fields) {
      const doc = docs.find((d) =>
        Object.hasOwn(d.attributes as object, field),
      );
      if (!doc)
        throw new AppError(
          400,
          "Selected attribute is unavailable. Uploaded files are not automatically extracted.",
        );
      const group = grouped.get(doc.id) ?? { doc, fields: [] };
      group.fields.push(field);
      grouped.set(doc.id, group);
    }
    const updated = await tx.shareRequest.updateMany({
      where: { id, status: "PENDING" },
      data: { status: "APPROVED", decidedAt: now },
    });
    if (updated.count !== 1)
      throw new AppError(409, "Request already decided.");
    for (const { doc, fields } of grouped.values())
      await tx.shareGrant.create({
        data: {
          requestId: id,
          documentId: doc.id,
          ownerId: user.id,
          recipientId: request.recipientId,
          approvedFields: fields,
          expiresAt: new Date(now.getTime() + data.durationHours * 3600000),
          consentAt: now,
          policyVersion: policy.version,
        },
      });
    await tx.accessEvent.create({
      data: {
        actorId: user.id,
        ownerId: user.id,
        action: "CONSENT_GRANTED",
        outcome: "SUCCESS",
        targetId: id,
        detail: `Explicit consent recorded for ${data.fields.length} attributes for ${data.durationHours} hours.`,
      },
    });
    return { status: "APPROVED" };
  });
}
export async function revoke(user: User, id: string) {
  requireRole(user, "STUDENT");
  return getDb().$transaction(async (tx) => {
    const grant = await tx.shareGrant.findUnique({ where: { id } });
    if (!grant || grant.ownerId !== user.id)
      throw new AppError(404, "Grant unavailable.");
    await tx.shareGrant.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await tx.accessEvent.create({
      data: {
        actorId: user.id,
        ownerId: user.id,
        action: "GRANT_REVOKED",
        outcome: "SUCCESS",
        targetId: id,
        detail:
          "Future application access blocked. Previously copied information cannot be erased.",
      },
    });
    return { status: "REVOKED" };
  });
}
export async function accessGrant(user: User, id: string) {
  // Read, authorize, project and audit in one SQLite transaction. No sensitive values in the audit.
  const result = await getDb().$transaction(async (tx) => {
    const grant = await tx.shareGrant.findUnique({
        where: { id },
        include: { document: true, request: true },
      }),
      policy = await tx.policy.findUniqueOrThrow({ where: { id: "sharing" } });
    let reason = "";
    if (user.role !== "RECIPIENT" || !grant || grant.recipientId !== user.id)
      reason = "Recipient identity does not match.";
    else if (
      grant.document.ownerId !== grant.ownerId ||
      grant.request.studentId !== grant.ownerId ||
      grant.request.recipientId !== user.id ||
      grant.request.status !== "APPROVED"
    )
      reason = "Document and consent relationship is invalid.";
    else if (grantState(grant) !== "ACTIVE")
      reason = `Grant is ${grantState(grant).toLowerCase()}.`;
    else if (
      grant.expiresAt.getTime() - grant.consentAt.getTime() >
      policy.maxDurationHours * 3600000
    )
      reason = "Grant exceeds current sharing policy.";
    else if (
      !(grant.approvedFields as string[]).length ||
      (grant.approvedFields as string[]).some(
        (f) =>
          !(grant.request.fields as string[]).includes(f) ||
          !fieldNames.includes(f) ||
          !Object.hasOwn(grant.document.attributes as object, f),
      )
    )
      reason = "Approved attributes are invalid.";
    await tx.accessEvent.create({
      data: {
        actorId: user.id,
        ownerId: grant?.ownerId,
        action: "GRANT_ACCESS",
        outcome: reason ? "DENIED" : "SUCCESS",
        targetId: id,
        detail:
          reason || "Recipient accessed approved synthetic attributes only.",
      },
    });
    if (reason || !grant) return { error: reason || "Grant unavailable." };
    const attrs = grant.document.attributes as Record<string, Prisma.JsonValue>;
    return {
      data: {
        grantId: grant.id,
        purpose: grant.request.purpose,
        expiresAt: grant.expiresAt,
        source: grant.document.attributeSource,
        attributes: Object.fromEntries(
          (grant.approvedFields as string[]).map((f) => [f, attrs[f]]),
        ),
      },
    };
  });
  if ("error" in result) throw new AppError(403, result.error!);
  return result.data;
}
export function proposalHash(p: {
  proposerId: string;
  proposedMaxHours: number;
  previousMaxHours: number;
  baseVersion: number;
  reason: string;
}) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        p.proposerId,
        p.proposedMaxHours,
        p.previousMaxHours,
        p.baseVersion,
        p.reason,
      ]),
    )
    .digest("hex");
}
export async function proposePolicy(user: User, input: unknown) {
  requireRole(user, "ADMINISTRATOR");
  const data = z
    .object({
      proposedMaxHours: z.number().int().min(1).max(720),
      reason: z.string().trim().min(10).max(500),
    })
    .parse(input);
  return getDb().$transaction(async (tx) => {
    const policy = await tx.policy.findUniqueOrThrow({
      where: { id: "sharing" },
    });
    if (data.proposedMaxHours === policy.maxDurationHours)
      throw new AppError(400, "Propose a different maximum duration.");
    const p = {
      ...data,
      proposerId: user.id,
      previousMaxHours: policy.maxDurationHours,
      baseVersion: policy.version,
    };
    const created = await tx.adminChangeRequest.create({
      data: { ...p, proposalHash: proposalHash(p) },
    });
    await tx.accessEvent.create({
      data: {
        actorId: user.id,
        action: "POLICY_PROPOSED",
        outcome: "PENDING",
        targetId: created.id,
        detail:
          "Immutable sharing-duration proposal submitted. Current policy unchanged.",
      },
    });
    return { id: created.id };
  });
}
export async function reviewPolicy(user: User, id: string, input: unknown) {
  requireRole(user, "ADMINISTRATOR");
  const { decision } = z
    .object({ decision: z.enum(["APPROVE", "REJECT"]) })
    .parse(input);
  return getDb().$transaction(async (tx) => {
    const p = await tx.adminChangeRequest.findUnique({ where: { id } });
    if (!p) throw new AppError(404, "Proposal unavailable.");
    if (p.proposerId === user.id)
      throw new AppError(
        403,
        "A different administrator must review this proposal.",
      );
    if (p.status !== "PENDING")
      throw new AppError(
        409,
        "Proposal already decided; duplicate decisions cannot apply it again.",
      );
    if (p.proposalHash !== proposalHash(p))
      throw new AppError(
        409,
        "Proposal integrity check failed. Create a new proposal.",
      );
    const policy = await tx.policy.findUniqueOrThrow({
      where: { id: "sharing" },
    });
    if (p.baseVersion !== policy.version)
      throw new AppError(
        409,
        "Policy changed since proposal. Create a new proposal against the current version.",
      );
    const now = new Date();
    const changed = await tx.adminChangeRequest.updateMany({
      where: { id, status: "PENDING" },
      data: {
        status: decision === "APPROVE" ? "APPLIED" : "REJECTED",
        reviewerId: user.id,
        decidedAt: now,
        appliedAt: decision === "APPROVE" ? now : null,
      },
    });
    if (changed.count !== 1) throw new AppError(409, "Already decided.");
    if (decision === "APPROVE") {
      const applied = await tx.policy.updateMany({
        where: { id: "sharing", version: p.baseVersion },
        data: {
          maxDurationHours: p.proposedMaxHours,
          version: { increment: 1 },
        },
      });
      if (applied.count !== 1)
        throw new AppError(
          409,
          "Concurrent policy change. Try a new proposal.",
        );
    }
    await tx.accessEvent.create({
      data: {
        actorId: user.id,
        action: decision === "APPROVE" ? "POLICY_APPLIED" : "POLICY_REJECTED",
        outcome: "SUCCESS",
        targetId: id,
        detail:
          decision === "APPROVE"
            ? `Two-person approval applied maximum ${p.proposedMaxHours} hours exactly once.`
            : "Proposal rejected; policy unchanged.",
      },
    });
    return { status: decision === "APPROVE" ? "APPLIED" : "REJECTED" };
  });
}
