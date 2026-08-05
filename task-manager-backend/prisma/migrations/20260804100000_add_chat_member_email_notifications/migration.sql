ALTER TABLE "public"."email_settings"
ADD COLUMN "notifyChatMemberAdded" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "chatMemberSubjectTemplate" TEXT NOT NULL DEFAULT '[Чат] Вас добавили: {{chatTitle}}',
ADD COLUMN "chatMemberBodyTemplate" TEXT NOT NULL DEFAULT E'Здравствуйте, {{memberName}}!\n\nВас добавили в чат «{{chatTitle}}».\nДобавил: {{addedByName}}.\n\n{{portalLink}}';

ALTER TABLE "public"."email_outbound_messages"
ALTER COLUMN "taskId" DROP NOT NULL,
ADD COLUMN "chatId" TEXT;

CREATE INDEX "email_outbound_messages_chatId_createdAt_idx"
ON "public"."email_outbound_messages"("chatId", "createdAt");

ALTER TABLE "public"."email_outbound_messages"
ADD CONSTRAINT "email_outbound_messages_chatId_fkey"
FOREIGN KEY ("chatId") REFERENCES "public"."chat_threads"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
