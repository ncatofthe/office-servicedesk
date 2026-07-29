CREATE TYPE "TaskSourceChannel" AS ENUM ('WEB', 'EMAIL');

ALTER TYPE "ExternalReferenceEntityType" ADD VALUE IF NOT EXISTS 'ATTACHMENT';

ALTER TABLE "tasks"
ADD COLUMN "sourceChannel" "TaskSourceChannel" NOT NULL DEFAULT 'WEB';

UPDATE "tasks" AS task
SET "sourceChannel" = 'EMAIL'
WHERE EXISTS (
  SELECT 1
  FROM "email_inbound_messages" AS inbound
  WHERE inbound."taskId" = task."id"
);

ALTER TABLE "task_external_references"
ADD COLUMN "attachmentId" TEXT;

CREATE INDEX "task_external_references_attachmentId_idx"
ON "task_external_references"("attachmentId");

ALTER TABLE "task_external_references"
ADD CONSTRAINT "task_external_references_attachmentId_fkey"
FOREIGN KEY ("attachmentId") REFERENCES "task_attachments"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "freshdesk_import_locks" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "freshdesk_import_locks_pkey" PRIMARY KEY ("id")
);
