CREATE TABLE "email_settings" (
 "id" TEXT NOT NULL DEFAULT 'default', "intakeEnabled" BOOLEAN NOT NULL DEFAULT false,
 "imapHost" TEXT NOT NULL DEFAULT 'imap.yandex.ru', "imapPort" INTEGER NOT NULL DEFAULT 993, "imapSecure" BOOLEAN NOT NULL DEFAULT true, "imapUser" TEXT, "imapPasswordEncrypted" TEXT,
 "mailbox" TEXT NOT NULL DEFAULT 'INBOX', "intakeStartUid" INTEGER NOT NULL DEFAULT 1, "intakeMaxMessages" INTEGER NOT NULL DEFAULT 30, "intakePollIntervalMs" INTEGER NOT NULL DEFAULT 300000, "attachmentMaxBytes" INTEGER NOT NULL DEFAULT 26214400,
 "defaultFolderId" TEXT, "defaultEntityId" TEXT, "defaultTypeId" TEXT, "defaultSubtypeId" TEXT,
 "outboundEnabled" BOOLEAN NOT NULL DEFAULT false, "smtpHost" TEXT NOT NULL DEFAULT 'smtp.yandex.ru', "smtpPort" INTEGER NOT NULL DEFAULT 465, "smtpSecure" BOOLEAN NOT NULL DEFAULT true, "smtpUser" TEXT, "smtpPasswordEncrypted" TEXT, "fromAddress" TEXT, "fromName" TEXT NOT NULL DEFAULT 'Office ServiceDesk',
 "workerEnabled" BOOLEAN NOT NULL DEFAULT true, "workerIntervalMs" INTEGER NOT NULL DEFAULT 60000, "workerBatchSize" INTEGER NOT NULL DEFAULT 20, "lockTtlMs" INTEGER NOT NULL DEFAULT 300000, "maxAttempts" INTEGER NOT NULL DEFAULT 5, "retryDelayMinutes" INTEGER NOT NULL DEFAULT 15,
 "notificationsEnabled" BOOLEAN NOT NULL DEFAULT true, "notifyRequesterCreated" BOOLEAN NOT NULL DEFAULT true, "notifyRequesterComment" BOOLEAN NOT NULL DEFAULT true, "notifyRequesterStatus" BOOLEAN NOT NULL DEFAULT true, "notifyRequesterAssigned" BOOLEAN NOT NULL DEFAULT false, "portalBaseUrl" TEXT,
 "createdSubjectTemplate" TEXT NOT NULL DEFAULT '[Заявка #{{ticketNumber}}] Заявка принята: {{title}}', "createdBodyTemplate" TEXT NOT NULL DEFAULT E'Здравствуйте, {{requesterName}}!\n\nМы зарегистрировали вашу заявку #{{ticketNumber}} «{{title}}».\nТекущий статус: {{status}}.\n\n{{portalLink}}',
 "commentSubjectTemplate" TEXT NOT NULL DEFAULT '[Заявка #{{ticketNumber}}] Новый ответ: {{title}}', "commentBodyTemplate" TEXT NOT NULL DEFAULT E'Здравствуйте, {{requesterName}}!\n\nПо заявке #{{ticketNumber}} появился новый ответ.\n\n{{comment}}\n\n{{portalLink}}',
 "statusSubjectTemplate" TEXT NOT NULL DEFAULT '[Заявка #{{ticketNumber}}] Статус изменён: {{status}}', "statusBodyTemplate" TEXT NOT NULL DEFAULT E'Здравствуйте, {{requesterName}}!\n\nСтатус заявки #{{ticketNumber}} «{{title}}» изменён: {{oldStatus}} → {{status}}.\n\n{{portalLink}}',
 "assignedSubjectTemplate" TEXT NOT NULL DEFAULT '[Заявка #{{ticketNumber}}] Назначен исполнитель', "assignedBodyTemplate" TEXT NOT NULL DEFAULT E'Здравствуйте, {{requesterName}}!\n\nПо заявке #{{ticketNumber}} назначен исполнитель: {{assigneeName}}.\n\n{{portalLink}}',
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "email_settings_pkey" PRIMARY KEY ("id")
);
