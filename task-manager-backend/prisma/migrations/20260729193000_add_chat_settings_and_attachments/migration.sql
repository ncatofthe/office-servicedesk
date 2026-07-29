-- ExtendEnum
ALTER TYPE "ChatKind" ADD VALUE IF NOT EXISTS 'GROUP';

-- CreateTable
CREATE TABLE "chat_attachments" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "chatsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "directChatsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "departmentChatsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "ticketChatsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "attachmentsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "maxAttachmentSizeMb" INTEGER NOT NULL DEFAULT 25,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_chat_participants" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "addedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_chat_participants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chat_attachments_messageId_idx" ON "chat_attachments"("messageId");
CREATE UNIQUE INDEX "task_chat_participants_taskId_userId_key" ON "task_chat_participants"("taskId", "userId");
CREATE INDEX "task_chat_participants_userId_taskId_idx" ON "task_chat_participants"("userId", "taskId");

-- AddForeignKey
ALTER TABLE "chat_attachments" ADD CONSTRAINT "chat_attachments_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "chat_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_chat_participants" ADD CONSTRAINT "task_chat_participants_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_chat_participants" ADD CONSTRAINT "task_chat_participants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SeedSettings
INSERT INTO "chat_settings" (
    "id",
    "chatsEnabled",
    "directChatsEnabled",
    "departmentChatsEnabled",
    "ticketChatsEnabled",
    "attachmentsEnabled",
    "maxAttachmentSizeMb",
    "createdAt",
    "updatedAt"
) VALUES ('default', true, true, true, true, true, 25, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
