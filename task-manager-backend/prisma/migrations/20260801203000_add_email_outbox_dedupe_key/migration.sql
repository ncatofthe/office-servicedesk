ALTER TABLE "public"."email_outbound_messages"
ADD COLUMN "dedupeKey" TEXT;

CREATE UNIQUE INDEX "email_outbound_messages_dedupeKey_key"
ON "public"."email_outbound_messages"("dedupeKey");
