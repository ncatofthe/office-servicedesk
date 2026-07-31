ALTER TABLE "email_settings"
ADD COLUMN "notifyAssigneeAssigned" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "assigneeSubjectTemplate" TEXT NOT NULL DEFAULT '[Заявка #{{ticketNumber}}] Вы назначены исполнителем: {{title}}',
ADD COLUMN "assigneeBodyTemplate" TEXT NOT NULL DEFAULT E'Здравствуйте, {{assigneeName}}!\n\nВы назначены исполнителем заявки #{{ticketNumber}} «{{title}}».\nЗаявитель: {{requesterName}}\nПриоритет: {{priority}}\n\nОписание:\n{{description}}\n\n{{portalLink}}';
