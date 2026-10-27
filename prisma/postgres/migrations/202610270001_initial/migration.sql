BEGIN;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "trustvault";

-- CreateTable
CREATE TABLE "trustvault"."users" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "organisation" TEXT,
    "demo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trustvault"."documents" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storageId" TEXT NOT NULL,
    "attributes" JSONB NOT NULL,
    "attributeSource" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trustvault"."share_requests" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "fields" JSONB NOT NULL,
    "documentKind" TEXT NOT NULL,
    "durationHours" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "share_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trustvault"."share_grants" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "approvedFields" JSONB NOT NULL,
    "consentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "policyVersion" INTEGER NOT NULL,

    CONSTRAINT "share_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trustvault"."access_events" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "ownerId" TEXT,
    "action" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "targetId" TEXT,
    "detail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trustvault"."admin_change_requests" (
    "id" TEXT NOT NULL,
    "proposerId" TEXT NOT NULL,
    "reviewerId" TEXT,
    "proposedMaxHours" INTEGER NOT NULL,
    "previousMaxHours" INTEGER NOT NULL,
    "baseVersion" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "proposalHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),

    CONSTRAINT "admin_change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trustvault"."policies" (
    "id" TEXT NOT NULL DEFAULT 'sharing',
    "maxDurationHours" INTEGER NOT NULL DEFAULT 168,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "policies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_subject_key" ON "trustvault"."users"("subject");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "trustvault"."users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "documents_storageId_key" ON "trustvault"."documents"("storageId");

-- CreateIndex
CREATE INDEX "documents_ownerId_idx" ON "trustvault"."documents"("ownerId");

-- CreateIndex
CREATE INDEX "share_requests_studentId_status_idx" ON "trustvault"."share_requests"("studentId", "status");

-- CreateIndex
CREATE INDEX "share_grants_recipientId_idx" ON "trustvault"."share_grants"("recipientId");

-- CreateIndex
CREATE UNIQUE INDEX "share_grants_requestId_documentId_key" ON "trustvault"."share_grants"("requestId", "documentId");

-- CreateIndex
CREATE INDEX "access_events_ownerId_createdAt_idx" ON "trustvault"."access_events"("ownerId", "createdAt");

-- AddForeignKey
ALTER TABLE "trustvault"."documents" ADD CONSTRAINT "documents_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "trustvault"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trustvault"."share_requests" ADD CONSTRAINT "share_requests_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "trustvault"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trustvault"."share_requests" ADD CONSTRAINT "share_requests_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "trustvault"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trustvault"."share_grants" ADD CONSTRAINT "share_grants_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "trustvault"."share_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trustvault"."share_grants" ADD CONSTRAINT "share_grants_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "trustvault"."documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trustvault"."share_grants" ADD CONSTRAINT "share_grants_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "trustvault"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trustvault"."share_grants" ADD CONSTRAINT "share_grants_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "trustvault"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trustvault"."access_events" ADD CONSTRAINT "access_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "trustvault"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trustvault"."admin_change_requests" ADD CONSTRAINT "admin_change_requests_proposerId_fkey" FOREIGN KEY ("proposerId") REFERENCES "trustvault"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trustvault"."admin_change_requests" ADD CONSTRAINT "admin_change_requests_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "trustvault"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Preserve the invariants enforced by the original SQLite migrations.
ALTER TABLE trustvault.users ADD CONSTRAINT valid_role
  CHECK (role IN ('STUDENT', 'RECIPIENT', 'ADMINISTRATOR'));
ALTER TABLE trustvault.share_requests ADD CONSTRAINT valid_request
  CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED') AND "durationHours" BETWEEN 1 AND 720);
ALTER TABLE trustvault.policies ADD CONSTRAINT bounded_policy
  CHECK ("maxDurationHours" BETWEEN 1 AND 720);

CREATE FUNCTION trustvault.check_request_transition() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF OLD.status <> 'PENDING' AND NEW.status <> OLD.status THEN
    RAISE EXCEPTION 'Invalid request transition';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER request_state_update BEFORE UPDATE OF status ON trustvault.share_requests
FOR EACH ROW EXECUTE FUNCTION trustvault.check_request_transition();

CREATE FUNCTION trustvault.check_grant_relationship() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW."ownerId" <> (SELECT "ownerId" FROM trustvault.documents WHERE id = NEW."documentId")
     OR NEW."ownerId" <> (SELECT "studentId" FROM trustvault.share_requests WHERE id = NEW."requestId")
     OR NEW."recipientId" <> (SELECT "recipientId" FROM trustvault.share_requests WHERE id = NEW."requestId")
     OR NEW."expiresAt" <= NEW."consentAt" THEN
    RAISE EXCEPTION 'Invalid grant relationship or expiry';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER grant_relationship_insert BEFORE INSERT ON trustvault.share_grants
FOR EACH ROW EXECUTE FUNCTION trustvault.check_grant_relationship();

CREATE FUNCTION trustvault.reject_proposal_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'Proposal is immutable; create a new proposal';
END;
$$;
CREATE TRIGGER proposal_immutable BEFORE UPDATE OF "proposerId", "proposedMaxHours", "previousMaxHours", "baseVersion", reason, "proposalHash"
ON trustvault.admin_change_requests FOR EACH ROW EXECUTE FUNCTION trustvault.reject_proposal_mutation();

CREATE FUNCTION trustvault.check_proposal_decision() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW."reviewerId" = NEW."proposerId" OR OLD.status <> 'PENDING' OR NEW.status NOT IN ('APPLIED', 'REJECTED') THEN
    RAISE EXCEPTION 'Independent final decision required';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER proposal_decision BEFORE UPDATE OF status, "reviewerId" ON trustvault.admin_change_requests
FOR EACH ROW EXECUTE FUNCTION trustvault.check_proposal_decision();

CREATE FUNCTION trustvault.check_policy_version() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'Invalid policy version';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER policy_version_update BEFORE UPDATE ON trustvault.policies
FOR EACH ROW EXECUTE FUNCTION trustvault.check_policy_version();

INSERT INTO trustvault.policies (id, "maxDurationHours", version) VALUES ('sharing', 168, 1);

-- All access goes through verified server routes and their ownership/consent
-- checks. Do not grant public access to these tables.
REVOKE ALL ON SCHEMA trustvault FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA trustvault FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA trustvault FROM PUBLIC;
ALTER TABLE trustvault.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE trustvault.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE trustvault.share_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE trustvault.share_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE trustvault.access_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE trustvault.admin_change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE trustvault.policies ENABLE ROW LEVEL SECURITY;

COMMIT;
