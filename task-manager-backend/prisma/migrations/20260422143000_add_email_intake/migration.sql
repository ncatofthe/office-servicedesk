-- CreateTable
CREATE TABLE "email_inbound_messages" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "mailbox" TEXT,
    "uid" INTEGER,
    "fromEmail" TEXT NOT NULL,
    "fromName" TEXT,
    "subject" TEXT,
    "receivedAt" TIMESTAMP(3),
    "textPreview" TEXT,
    "taskId" TEXT,
    "createdUserId" TEXT,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_inbound_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_inbound_messages_messageId_key" ON "email_inbound_messages"("messageId");
CREATE UNIQUE INDEX "email_inbound_messages_mailbox_uid_key" ON "email_inbound_messages"("mailbox", "uid");
CREATE INDEX "email_inbound_messages_fromEmail_idx" ON "email_inbound_messages"("fromEmail");
CREATE INDEX "email_inbound_messages_taskId_idx" ON "email_inbound_messages"("taskId");
CREATE INDEX "email_inbound_messages_createdUserId_idx" ON "email_inbound_messages"("createdUserId");

-- AddForeignKey
ALTER TABLE "email_inbound_messages" ADD CONSTRAINT "email_inbound_messages_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "email_inbound_messages" ADD CONSTRAINT "email_inbound_messages_createdUserId_fkey" FOREIGN KEY ("createdUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
