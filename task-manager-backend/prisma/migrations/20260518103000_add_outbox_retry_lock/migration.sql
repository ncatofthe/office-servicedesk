ALTER TABLE "public"."email_outbound_messages"
ADD COLUMN "lockedAt" TIMESTAMP(3),
ADD COLUMN "lockedBy" TEXT;

CREATE INDEX "email_outbound_messages_lockedAt_idx"
ON "public"."email_outbound_messages"("lockedAt");
