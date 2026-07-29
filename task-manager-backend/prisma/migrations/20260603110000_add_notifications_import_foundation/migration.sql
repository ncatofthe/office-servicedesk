CREATE TYPE "public"."ExternalSystem" AS ENUM ('FRESHDESK', 'ONE_C');
CREATE TYPE "public"."ExternalReferenceEntityType" AS ENUM ('TASK', 'COMMENT');
CREATE TYPE "public"."ImportRunStatus" AS ENUM ('DRY_RUN', 'SUCCESS', 'PARTIAL', 'FAILED');

ALTER TABLE "public"."notifications"
ADD COLUMN "title" TEXT NOT NULL DEFAULT 'Уведомление',
ADD COLUMN "eventKey" TEXT,
ADD COLUMN "metadata" JSONB,
ADD COLUMN "readAt" TIMESTAMP(3),
ADD COLUMN "emailOutboxId" TEXT,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "public"."notifications"
SET "title" = CASE
    WHEN COALESCE("type", '') = 'task_assigned' THEN 'Назначена заявка'
    WHEN COALESCE("type", '') = 'task_comment' THEN 'Новый комментарий'
    ELSE 'Уведомление'
END;

CREATE TABLE "public"."task_external_references" (
    "id" TEXT NOT NULL,
    "system" "public"."ExternalSystem" NOT NULL,
    "entityType" "public"."ExternalReferenceEntityType" NOT NULL,
    "externalId" TEXT NOT NULL,
    "externalNumber" TEXT,
    "metadata" JSONB,
    "taskId" TEXT,
    "commentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "task_external_references_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."freshdesk_import_runs" (
    "id" TEXT NOT NULL,
    "source" "public"."ExternalSystem" NOT NULL DEFAULT 'FRESHDESK',
    "status" "public"."ImportRunStatus" NOT NULL,
    "dryRun" BOOLEAN NOT NULL DEFAULT false,
    "fileName" TEXT,
    "summary" JSONB,
    "errors" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    CONSTRAINT "freshdesk_import_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notifications_userId_eventKey_key" ON "public"."notifications"("userId", "eventKey");
CREATE INDEX "notifications_userId_isRead_createdAt_idx" ON "public"."notifications"("userId", "isRead", "createdAt");
CREATE INDEX "notifications_taskId_idx" ON "public"."notifications"("taskId");
CREATE INDEX "notifications_emailOutboxId_idx" ON "public"."notifications"("emailOutboxId");

CREATE UNIQUE INDEX "task_external_references_system_entityType_externalId_key"
ON "public"."task_external_references"("system", "entityType", "externalId");
CREATE INDEX "task_external_references_taskId_idx" ON "public"."task_external_references"("taskId");
CREATE INDEX "task_external_references_commentId_idx" ON "public"."task_external_references"("commentId");

CREATE INDEX "freshdesk_import_runs_source_createdAt_idx" ON "public"."freshdesk_import_runs"("source", "createdAt");
CREATE INDEX "freshdesk_import_runs_createdById_idx" ON "public"."freshdesk_import_runs"("createdById");

ALTER TABLE "public"."notifications"
ADD CONSTRAINT "notifications_emailOutboxId_fkey"
FOREIGN KEY ("emailOutboxId") REFERENCES "public"."email_outbound_messages"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."task_external_references"
ADD CONSTRAINT "task_external_references_taskId_fkey"
FOREIGN KEY ("taskId") REFERENCES "public"."tasks"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."task_external_references"
ADD CONSTRAINT "task_external_references_commentId_fkey"
FOREIGN KEY ("commentId") REFERENCES "public"."task_comments"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."freshdesk_import_runs"
ADD CONSTRAINT "freshdesk_import_runs_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "public"."users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
