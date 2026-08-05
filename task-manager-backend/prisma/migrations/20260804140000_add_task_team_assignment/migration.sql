ALTER TABLE "tasks" ADD COLUMN "teamId" TEXT;

CREATE INDEX "tasks_teamId_idx" ON "tasks"("teamId");

ALTER TABLE "tasks"
ADD CONSTRAINT "tasks_teamId_fkey"
FOREIGN KEY ("teamId") REFERENCES "support_teams"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
