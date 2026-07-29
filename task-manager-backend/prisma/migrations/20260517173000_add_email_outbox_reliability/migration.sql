CREATE TYPE "public"."EmailOutboundStatus" AS ENUM (
    'DRY_RUN',
    'SENT',
    'FAILED',
    'RETRY_PENDING'
);

CREATE TABLE "public"."email_outbound_messages" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "commentId" TEXT,
    "recipientEmail" TEXT NOT NULL,
    "recipientName" TEXT,
    "fromEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "textPreview" TEXT,
    "status" "public"."EmailOutboundStatus" NOT NULL,
    "dryRun" BOOLEAN NOT NULL DEFAULT false,
    "messageId" TEXT,
    "providerMessageId" TEXT,
    "inReplyTo" TEXT,
    "references" TEXT,
    "errorMessage" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "nextRetryAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_outbound_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "email_outbound_messages_taskId_createdAt_idx" ON "public"."email_outbound_messages"("taskId", "createdAt");
CREATE INDEX "email_outbound_messages_status_nextRetryAt_idx" ON "public"."email_outbound_messages"("status", "nextRetryAt");
CREATE INDEX "email_outbound_messages_createdById_idx" ON "public"."email_outbound_messages"("createdById");
CREATE INDEX "email_outbound_messages_commentId_idx" ON "public"."email_outbound_messages"("commentId");

ALTER TABLE "public"."email_outbound_messages"
ADD CONSTRAINT "email_outbound_messages_taskId_fkey"
FOREIGN KEY ("taskId") REFERENCES "public"."tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."email_outbound_messages"
ADD CONSTRAINT "email_outbound_messages_commentId_fkey"
FOREIGN KEY ("commentId") REFERENCES "public"."task_comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."email_outbound_messages"
ADD CONSTRAINT "email_outbound_messages_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
