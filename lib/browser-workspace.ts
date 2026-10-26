import { z } from "zod";
import { assess, fieldNames } from "./guardian";
import { samplePdfBytes, syntheticSamples } from "./sample-documents";

// The hosted demonstration has no accounts or shared backend. All identities,
// records and uploaded bytes belong to this tab and disappear on reload.
type Identity = {
  id: string;
  name: string;
  email: string;
  role: "STUDENT" | "RECIPIENT" | "ADMINISTRATOR";
  organisation?: string;
};
const identities: Identity[] = [
  {
    id: "student-maya",
    name: "Maya Chen",
    email: "maya@students.example.test",
    role: "STUDENT",
  },
  {
    id: "recipient-campus",
    name: "Alex Morgan",
    email: "verify@campusnest.example.test",
    role: "RECIPIENT",
    organisation: "CampusNest · simulated accommodation",
  },
  {
    id: "admin-jordan",
    name: "Jordan Lee",
    email: "jordan@trustvault.example.test",
    role: "ADMINISTRATOR",
  },
  {
    id: "admin-sam",
    name: "Sam Rivera",
    email: "sam@trustvault.example.test",
    role: "ADMINISTRATOR",
  },
];
type Document = {
  id: string;
  ownerId: string;
  title: string;
  kind: string;
  mime: string;
  size: number;
  attributes: Record<string, string>;
  attributeSource: string;
  createdAt: string;
  file: Blob;
};
type ShareRequest = {
  id: string;
  studentId: string;
  recipientId: string;
  purpose: string;
  fields: string[];
  documentKind: string;
  durationHours: number;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
};
type Grant = {
  id: string;
  requestId: string;
  documentId: string;
  ownerId: string;
  recipientId: string;
  approvedFields: string[];
  consentAt: string;
  expiresAt: string;
  revokedAt: string | null;
};
type Proposal = {
  id: string;
  proposerId: string;
  reviewerId?: string;
  proposedMaxHours: number;
  previousMaxHours: number;
  baseVersion: number;
  reason: string;
  status: "PENDING" | "APPLIED" | "REJECTED";
  createdAt: string;
  appliedAt?: string;
  proposalHash: string;
};
type Event = {
  id: string;
  actorId: string;
  ownerId?: string;
  action: string;
  outcome: string;
  detail: string;
  createdAt: string;
};
const fieldsSchema = z
  .array(z.enum(fieldNames as [string, ...string[]]))
  .min(1)
  .max(8)
  .refine(
    (fields) => new Set(fields).size === fields.length,
    "Select each attribute only once.",
  );
const decisionSchema = z.object({ decision: z.enum(["APPROVE", "REJECT"]) });
const hoursSchema = z.number().int().min(1).max(720);

export function createBrowserWorkspace() {
  let userId: string = identities[0].id;
  let policy = { maxDurationHours: 168, version: 1 };
  let documents: Document[] = [];
  let requests: ShareRequest[] = [];
  let grants: Grant[] = [];
  let proposals: Proposal[] = [];
  let activity: Event[] = [];
  let previewUrls: string[] = [];
  const now = () => new Date().toISOString();
  const identity = (id: string) => identities.find((item) => item.id === id)!;
  function current(role?: Identity["role"]) {
    const user = identity(userId);
    if (!user) throw new Error("Choose a demo identity to continue.");
    if (role && user.role !== role)
      throw new Error("This action is unavailable for the selected demo role.");
    return user;
  }
  function record(
    action: string,
    detail: string,
    outcome = "SUCCESS",
    ownerId?: string,
  ) {
    activity.unshift({
      id: crypto.randomUUID(),
      actorId: userId,
      ownerId,
      action,
      detail,
      outcome,
      createdAt: now(),
    });
  }
  function addSamples() {
    documents.push(
      ...syntheticSamples.map((sample) => {
        const bytes = samplePdfBytes(
          sample.title,
          Object.entries(sample.attributes).map(
            ([key, value]) => `${key}: ${value}`,
          ),
        );
        return {
          ...sample,
          attributes: { ...sample.attributes },
          ownerId: identities[0].id,
          mime: "application/pdf",
          size: bytes.byteLength,
          attributeSource:
            "Fictional sample attributes; not extracted from an uploaded file.",
          createdAt: now(),
          file: new Blob([bytes], { type: "application/pdf" }),
        };
      }),
    );
  }
  function reset() {
    previewUrls.forEach((url) => URL.revokeObjectURL(url));
    previewUrls = [];
    userId = identities[0].id;
    policy = { maxDurationHours: 168, version: 1 };
    documents = [];
    addSamples();
    const common = {
      studentId: identities[0].id,
      recipientId: identities[1].id,
      documentKind: "enrolment",
      createdAt: now(),
    };
    requests = [
      {
        ...common,
        id: "request-reasonable",
        purpose:
          "Verify current student enrolment for a student accommodation application.",
        fields: ["enrolmentStatus", "fullName"],
        durationHours: 24,
        status: "PENDING",
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
        status: "PENDING",
      },
      ...["active", "expired", "revoked"].map(
        (state): ShareRequest => ({
          ...common,
          id: `request-${state}`,
          purpose:
            "Confirm student status for a simulated accommodation eligibility check.",
          fields: ["enrolmentStatus", "fullName"],
          durationHours: 24,
          status: "APPROVED",
        }),
      ),
    ];
    grants = ["active", "expired", "revoked"].map((state) => ({
      id: `grant-${state}`,
      requestId: `request-${state}`,
      documentId: "doc-enrolment",
      ownerId: identities[0].id,
      recipientId: identities[1].id,
      approvedFields: ["enrolmentStatus", "fullName"],
      consentAt: new Date(
        Date.now() - (state === "expired" ? 48 : 1) * 3600000,
      ).toISOString(),
      expiresAt: new Date(
        Date.now() + (state === "expired" ? -24 : 23) * 3600000,
      ).toISOString(),
      revokedAt: state === "revoked" ? now() : null,
    }));
    proposals = [
      {
        id: "proposal-duration",
        proposerId: identities[2].id,
        proposedMaxHours: 336,
        previousMaxHours: 168,
        baseVersion: 1,
        reason:
          "Allow up to 14 days for simulated accommodation application reviews.",
        status: "PENDING",
        createdAt: now(),
        proposalHash: "demo-initial-policy-proposal",
      },
    ];
    activity = [];
    record(
      "VAULT_READY",
      "Three fictional documents ready in this browser tab.",
      "SUCCESS",
      identities[0].id,
    );
  }
  const state = (grant: Grant) =>
    grant.revokedAt
      ? "REVOKED"
      : Date.parse(grant.expiresAt) <= Date.now()
        ? "EXPIRED"
        : "ACTIVE";
  function overview() {
    const user = current();
    return {
      user,
      policy,
      activity: activity
        .filter((event) =>
          user.role === "STUDENT"
            ? event.ownerId === user.id
            : user.role === "ADMINISTRATOR"
              ? event.action.startsWith("POLICY_")
              : event.actorId === user.id,
        )
        .slice(0, 50),
      ...(user.role === "STUDENT"
        ? {
            documents: documents
              .filter((doc) => doc.ownerId === user.id)
              .map(({ file: _file, ...doc }) => doc),
          }
        : {}),
      ...(user.role !== "ADMINISTRATOR"
        ? {
            requests: requests
              .filter(
                (request) =>
                  (user.role === "STUDENT"
                    ? request.studentId
                    : request.recipientId) === user.id,
              )
              .map((request) => ({
                ...request,
                recipient: identity(request.recipientId),
                guardian: assess(
                  request.purpose,
                  request.fields,
                  request.durationHours,
                ),
              })),
            grants: grants
              .filter(
                (grant) =>
                  (user.role === "STUDENT"
                    ? grant.ownerId
                    : grant.recipientId) === user.id,
              )
              .map((grant) => ({
                ...grant,
                state: state(grant),
                document: {
                  title: documents.find((doc) => doc.id === grant.documentId)!
                    .title,
                },
                recipient: identity(grant.recipientId),
                owner: { name: identity(grant.ownerId).name },
                request: {
                  purpose: requests.find(
                    (request) => request.id === grant.requestId,
                  )!.purpose,
                },
              })),
          }
        : {
            proposals: proposals.map((proposal) => ({
              ...proposal,
              proposer: identity(proposal.proposerId),
              reviewer: proposal.reviewerId
                ? identity(proposal.reviewerId)
                : undefined,
            })),
          }),
      ...(user.role === "RECIPIENT"
        ? {
            students: identities
              .filter((person) => person.role === "STUDENT")
              .map(({ id, name }) => ({ id, name })),
          }
        : {}),
    };
  }
  function previewDocument(id: string) {
    const user = current("STUDENT");
    const document = documents.find(
      (doc) => doc.id === id && doc.ownerId === user.id,
    );
    if (!document)
      throw new Error("Document unavailable for the selected demo identity.");
    const url = URL.createObjectURL(document.file);
    previewUrls.push(url);
    record(
      "DOCUMENT_PREVIEW",
      "Demo document opened in this tab.",
      "SUCCESS",
      user.id,
    );
    return url;
  }
  async function dispatch(
    route: string,
    method: string,
    body?: unknown,
  ): Promise<unknown> {
    if (route === "session" && method === "GET")
      return {
        user: identity(userId),
        identities,
      };
    if (route === "identity" && method === "POST") {
      const { userId: selected } = z.object({ userId: z.string() }).parse(body);
      if (!identity(selected))
        throw new Error("Choose one of the demo identities.");
      userId = selected;
      return { ok: true };
    }
    if (route === "demo/reset" && method === "POST") {
      reset();
      return { ok: true };
    }
    const user = current();
    if (route === "overview" && method === "GET") return overview();
    if (route === "documents/samples" && method === "POST") {
      current("STUDENT");
      if (
        documents.some(
          (doc) =>
            doc.ownerId === user.id && Object.keys(doc.attributes).length,
        )
      )
        throw new Error("Your vault already contains synthetic samples.");
      addSamples();
      record(
        "SYNTHETIC_SAMPLES_ADDED",
        "Fictional sample documents added.",
        "SUCCESS",
        user.id,
      );
      return { created: 3 };
    }
    if (route === "documents" && method === "POST") {
      current("STUDENT");
      if (!(body instanceof FormData))
        throw new Error("Choose a synthetic file.");
      const file = body.get("file");
      if (!(file instanceof File) || !file.size || file.size > 5 * 1024 * 1024)
        throw new Error("Choose a non-empty PDF, PNG, or JPEG up to 5 MB.");
      const input = z
        .object({
          title: z.string().trim().min(2).max(100),
          kind: z.enum(["enrolment", "passport", "insurance", "other"]),
        })
        .parse({ title: body.get("title"), kind: body.get("kind") });
      const bytes = new Uint8Array(await file.arrayBuffer());
      const signature =
        file.type === "application/pdf"
          ? new TextDecoder().decode(bytes.subarray(0, 5)) === "%PDF-"
          : file.type === "image/png"
            ? [137, 80, 78, 71, 13, 10, 26, 10].every(
                (value, index) => bytes[index] === value,
              )
            : file.type === "image/jpeg" &&
              bytes[0] === 255 &&
              bytes[1] === 216 &&
              bytes[2] === 255;
      if (!signature)
        throw new Error(
          "Unsupported file or file signature does not match its type.",
        );
      const document: Document = {
        ...input,
        id: crypto.randomUUID(),
        ownerId: user.id,
        mime: file.type,
        size: file.size,
        attributes: {},
        attributeSource:
          "Browser-only upload; contents not extracted or verified.",
        createdAt: now(),
        file,
      };
      documents.push(document);
      record(
        "DOCUMENT_UPLOADED",
        "Synthetic file added to this browser tab.",
        "SUCCESS",
        user.id,
      );
      return { id: document.id };
    }
    if (route === "requests" && method === "POST") {
      current("RECIPIENT");
      const input = z
        .object({
          studentId: z.string(),
          purpose: z.string().trim().min(12).max(500),
          fields: fieldsSchema,
          documentKind: z.enum(["enrolment", "passport", "insurance"]),
          durationHours: hoursSchema,
        })
        .parse(body);
      if (
        !identities.some(
          (person) =>
            person.id === input.studentId && person.role === "STUDENT",
        )
      )
        throw new Error("Choose a demo student.");
      const request: ShareRequest = {
        ...input,
        id: crypto.randomUUID(),
        recipientId: user.id,
        status: "PENDING",
        createdAt: now(),
      };
      requests.unshift(request);
      record(
        "REQUEST_CREATED",
        "Request awaiting student consent. Nothing shared.",
        "PENDING",
        input.studentId,
      );
      return { id: request.id };
    }
    const [resource, id, action] = route.split("/");
    if (resource === "requests" && action === "decide" && method === "POST") {
      current("STUDENT");
      const request = requests.find(
        (item) => item.id === id && item.studentId === user.id,
      );
      if (!request) throw new Error("Request unavailable.");
      if (request.status !== "PENDING")
        throw new Error("This request has already been decided.");
      const { decision } = decisionSchema.parse(body);
      if (decision === "REJECT") {
        request.status = "REJECTED";
        record(
          "REQUEST_REJECTED",
          "Request rejected; no information shared.",
          "SUCCESS",
          user.id,
        );
        return { ok: true };
      }
      const input = z
        .object({ fields: fieldsSchema, durationHours: hoursSchema })
        .parse(body);
      if (
        input.durationHours > request.durationHours ||
        input.durationHours > policy.maxDurationHours
      )
        throw new Error("Duration exceeds the request or current policy.");
      if (input.fields.some((field) => !request.fields.includes(field)))
        throw new Error("Choose only attributes in the request.");
      const sources = documents.filter((doc) => doc.ownerId === user.id);
      if (
        input.fields.some(
          (field) => !sources.some((doc) => field in doc.attributes),
        )
      )
        throw new Error(
          "A selected attribute is unavailable in the sample documents.",
        );
      const consentAt = now(),
        expiresAt = new Date(
          Date.now() + input.durationHours * 3600000,
        ).toISOString();
      for (const doc of sources) {
        const approvedFields = input.fields.filter(
          (field) => field in doc.attributes,
        );
        if (approvedFields.length)
          grants.unshift({
            id: crypto.randomUUID(),
            requestId: id,
            documentId: doc.id,
            ownerId: user.id,
            recipientId: request.recipientId,
            approvedFields,
            consentAt,
            expiresAt,
            revokedAt: null,
          });
      }
      request.status = "APPROVED";
      record(
        "CONSENT_GRANTED",
        "Only selected sample attributes approved for a limited time.",
        "SUCCESS",
        user.id,
      );
      return { ok: true };
    }
    if (resource === "grants" && action === "revoke" && method === "POST") {
      current("STUDENT");
      const grant = grants.find(
        (item) => item.id === id && item.ownerId === user.id,
      );
      if (!grant) throw new Error("Grant unavailable.");
      if (state(grant) !== "ACTIVE")
        throw new Error("Only an active grant can be revoked.");
      grant.revokedAt = now();
      record(
        "GRANT_REVOKED",
        "Future demo access revoked.",
        "SUCCESS",
        user.id,
      );
      return { ok: true };
    }
    if (resource === "grants" && action === "access" && method === "GET") {
      current("RECIPIENT");
      const grant = grants.find(
        (item) => item.id === id && item.recipientId === user.id,
      );
      const deny = (message: string): never => {
        record("GRANT_ACCESS", message, "DENIED", grant?.ownerId);
        throw new Error(message);
      };
      if (!grant) return deny("Grant unavailable for this demo recipient.");
      if (state(grant) !== "ACTIVE")
        return deny(
          `Access denied: this permission is ${state(grant).toLowerCase()}.`,
        );
      if (
        Date.parse(grant.expiresAt) - Date.parse(grant.consentAt) >
        policy.maxDurationHours * 3600000
      )
        return deny("Access denied by the current sharing duration policy.");
      const document = documents.find((doc) => doc.id === grant.documentId)!;
      const request = requests.find((item) => item.id === grant.requestId)!;
      record(
        "GRANT_ACCESS",
        "Approved sample attributes viewed.",
        "SUCCESS",
        grant.ownerId,
      );
      return {
        attributes: Object.fromEntries(
          grant.approvedFields.map((field) => [
            field,
            document.attributes[field],
          ]),
        ),
        expiresAt: grant.expiresAt,
        purpose: request.purpose,
        source: document.attributeSource,
      };
    }
    if (route === "proposals" && method === "POST") {
      current("ADMINISTRATOR");
      const input = z
        .object({
          proposedMaxHours: hoursSchema,
          reason: z.string().trim().min(10).max(500),
        })
        .parse(body);
      if (input.proposedMaxHours === policy.maxDurationHours)
        throw new Error("Propose a different sharing duration.");
      const proposal: Proposal = {
        ...input,
        id: crypto.randomUUID(),
        proposerId: user.id,
        previousMaxHours: policy.maxDurationHours,
        baseVersion: policy.version,
        status: "PENDING",
        createdAt: now(),
        proposalHash: crypto.randomUUID(),
      };
      proposals.unshift(proposal);
      record(
        "POLICY_PROPOSED",
        "Policy change awaits a different demo administrator.",
        "PENDING",
      );
      return { id: proposal.id };
    }
    if (resource === "proposals" && action === "review" && method === "POST") {
      current("ADMINISTRATOR");
      const proposal = proposals.find((item) => item.id === id);
      if (!proposal) throw new Error("Proposal unavailable.");
      if (proposal.status !== "PENDING")
        throw new Error("This proposal has already been decided.");
      if (proposal.proposerId === user.id)
        throw new Error("A different administrator must review this proposal.");
      const { decision } = decisionSchema.parse(body);
      if (decision === "APPROVE" && proposal.baseVersion !== policy.version)
        throw new Error(
          "The policy has changed. Submit a new proposal against the current version.",
        );
      proposal.reviewerId = user.id;
      proposal.status = decision === "APPROVE" ? "APPLIED" : "REJECTED";
      if (decision === "APPROVE") {
        policy = {
          maxDurationHours: proposal.proposedMaxHours,
          version: policy.version + 1,
        };
        proposal.appliedAt = now();
      }
      record(
        `POLICY_${proposal.status}`,
        decision === "APPROVE"
          ? "A second demo administrator applied the sharing policy."
          : "Proposal rejected. Current policy unchanged.",
      );
      return { ok: true };
    }
    throw new Error("Demo action unavailable.");
  }
  reset();
  return {
    async request<T = unknown>(
      route: string,
      method = "GET",
      body?: unknown,
    ): Promise<T> {
      try {
        return structuredClone(await dispatch(route, method, body)) as T;
      } catch (error) {
        if (error instanceof z.ZodError)
          throw new Error(error.issues.map((issue) => issue.message).join(" "));
        throw error;
      }
    },
    previewDocument,
  };
}

let workspace: ReturnType<typeof createBrowserWorkspace> | undefined;
function currentWorkspace() {
  return (workspace ??= createBrowserWorkspace());
}
export const browserApi = <T = unknown>(
  route: string,
  method = "GET",
  body?: unknown,
) => currentWorkspace().request<T>(route, method, body);
export const browserPreview = (id: string) =>
  currentWorkspace().previewDocument(id);
