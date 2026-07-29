-- CreateEnum
CREATE TYPE "AutomationRuleTriggerType" AS ENUM ('TASK_CREATED', 'EMAIL_TICKET_CREATED');

-- CreateEnum
CREATE TYPE "AutomationRuleChannel" AS ENUM ('WEB', 'EMAIL');

-- CreateEnum
CREATE TYPE "AutomationRunStatus" AS ENUM ('SUCCESS', 'ERROR');

-- CreateTable
CREATE TABLE "automation_rules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "triggerType" "AutomationRuleTriggerType" NOT NULL,
    "conditionChannel" "AutomationRuleChannel",
    "conditionFolderId" TEXT,
    "conditionEntityId" TEXT,
    "conditionTypeId" TEXT,
    "conditionSubtypeId" TEXT,
    "conditionPriority" "TaskPriority",
    "conditionRequesterEmailContains" TEXT,
    "conditionTitleContains" TEXT,
    "actionSetFolderId" TEXT,
    "actionSetEntityId" TEXT,
    "actionSetTypeId" TEXT,
    "actionSetSubtypeId" TEXT,
    "actionSetPriority" "TaskPriority",
    "actionSetAssigneeIdsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "actionSetAssigneeIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_runs" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "ruleName" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "triggerType" "AutomationRuleTriggerType" NOT NULL,
    "appliedActions" JSONB,
    "status" "AutomationRunStatus" NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "automation_rules_triggerType_isActive_sortOrder_idx" ON "automation_rules"("triggerType", "isActive", "sortOrder");
CREATE INDEX "automation_rules_conditionFolderId_idx" ON "automation_rules"("conditionFolderId");
CREATE INDEX "automation_rules_conditionEntityId_idx" ON "automation_rules"("conditionEntityId");
CREATE INDEX "automation_rules_conditionTypeId_idx" ON "automation_rules"("conditionTypeId");
CREATE INDEX "automation_rules_conditionSubtypeId_idx" ON "automation_rules"("conditionSubtypeId");
CREATE INDEX "automation_runs_taskId_idx" ON "automation_runs"("taskId");
CREATE INDEX "automation_runs_ruleId_idx" ON "automation_runs"("ruleId");
CREATE INDEX "automation_runs_createdAt_idx" ON "automation_runs"("createdAt");
