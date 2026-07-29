CREATE TYPE "public"."TaskTimelineEventType" AS ENUM (
    'TASK_CREATED',
    'TASK_UPDATED',
    'STATUS_CHANGED',
    'ASSIGNEE_ADDED',
    'ASSIGNEE_REMOVED',
    'COMMENT_ADDED',
    'INTERNAL_NOTE_ADDED',
    'FILE_ATTACHED',
    'FILE_DELETED',
    'TASK_MERGED',
    'CLOSE_APPROVED',
    'CANNED_REPLY_USED',
    'EMAIL_REPLY_SENT',
    'SLA_POLICY_APPLIED',
    'AUTOMATION_APPLIED'
);

CREATE TABLE "public"."task_timeline_events" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "actorId" TEXT,
    "type" "public"."TaskTimelineEventType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_timeline_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "task_timeline_events_taskId_createdAt_idx" ON "public"."task_timeline_events"("taskId", "createdAt");
CREATE INDEX "task_timeline_events_taskId_type_idx" ON "public"."task_timeline_events"("taskId", "type");
CREATE INDEX "task_timeline_events_actorId_idx" ON "public"."task_timeline_events"("actorId");

ALTER TABLE "public"."task_timeline_events"
ADD CONSTRAINT "task_timeline_events_taskId_fkey"
FOREIGN KEY ("taskId") REFERENCES "public"."tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."task_timeline_events"
ADD CONSTRAINT "task_timeline_events_actorId_fkey"
FOREIGN KEY ("actorId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
