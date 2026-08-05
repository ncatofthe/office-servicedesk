ALTER TABLE "ticket_types" ADD COLUMN "teamId" TEXT;
ALTER TABLE "ticket_subtypes" ADD COLUMN "teamId" TEXT;

CREATE INDEX "ticket_types_teamId_idx" ON "ticket_types"("teamId");
CREATE INDEX "ticket_subtypes_teamId_idx" ON "ticket_subtypes"("teamId");

ALTER TABLE "ticket_types"
ADD CONSTRAINT "ticket_types_teamId_fkey"
FOREIGN KEY ("teamId") REFERENCES "support_teams"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ticket_subtypes"
ADD CONSTRAINT "ticket_subtypes_teamId_fkey"
FOREIGN KEY ("teamId") REFERENCES "support_teams"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "email_settings"
ADD COLUMN "notifyTeamNewTask" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "teamNewTaskSubjectTemplate" TEXT NOT NULL DEFAULT '[Команда {{teamName}}] Новая заявка #{{ticketNumber}}: {{title}}',
ADD COLUMN "teamNewTaskBodyTemplate" TEXT NOT NULL DEFAULT E'Здравствуйте, {{memberName}}!\n\nВ очереди команды «{{teamName}}» появилась новая заявка #{{ticketNumber}} «{{title}}».\nПапка: {{folderName}}\nТип: {{typeName}}\nПодтип: {{subtypeName}}\nЗаявитель: {{requesterName}}\nПриоритет: {{priority}}\n\nОписание:\n{{description}}\n\n{{portalLink}}';
