CREATE TYPE "SlaTimerStatus" AS ENUM ('PENDING', 'MET', 'BREACHED');

CREATE TABLE "sla_policies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "folderId" TEXT,
    "typeId" TEXT,
    "subtypeId" TEXT,
    "priority" "TaskPriority",
    "firstResponseMinutes" INTEGER,
    "resolutionMinutes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sla_policies_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "tasks"
ADD COLUMN "slaPolicyId" TEXT,
ADD COLUMN "firstResponseDueAt" TIMESTAMP(3),
ADD COLUMN "resolutionDueAt" TIMESTAMP(3),
ADD COLUMN "firstResponseAt" TIMESTAMP(3),
ADD COLUMN "resolvedAt" TIMESTAMP(3),
ADD COLUMN "slaFirstResponseStatus" "SlaTimerStatus",
ADD COLUMN "slaResolutionStatus" "SlaTimerStatus";

CREATE UNIQUE INDEX "sla_policies_name_key" ON "sla_policies"("name");
CREATE INDEX "sla_policies_isActive_sortOrder_idx" ON "sla_policies"("isActive", "sortOrder");
CREATE INDEX "sla_policies_folderId_idx" ON "sla_policies"("folderId");
CREATE INDEX "sla_policies_typeId_idx" ON "sla_policies"("typeId");
CREATE INDEX "sla_policies_subtypeId_idx" ON "sla_policies"("subtypeId");
CREATE INDEX "sla_policies_priority_idx" ON "sla_policies"("priority");
CREATE INDEX "tasks_slaPolicyId_idx" ON "tasks"("slaPolicyId");

ALTER TABLE "sla_policies"
ADD CONSTRAINT "sla_policies_folderId_fkey"
FOREIGN KEY ("folderId") REFERENCES "ticket_folders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sla_policies"
ADD CONSTRAINT "sla_policies_typeId_fkey"
FOREIGN KEY ("typeId") REFERENCES "ticket_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sla_policies"
ADD CONSTRAINT "sla_policies_subtypeId_fkey"
FOREIGN KEY ("subtypeId") REFERENCES "ticket_subtypes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "tasks"
ADD CONSTRAINT "tasks_slaPolicyId_fkey"
FOREIGN KEY ("slaPolicyId") REFERENCES "sla_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
