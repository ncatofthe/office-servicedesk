-- AlterEnum
ALTER TYPE "TaskStatus" ADD VALUE 'MERGED';

-- CreateEnum
CREATE TYPE "TaskMergeMode" AS ENUM ('LINK', 'UNION');

-- CreateTable
CREATE TABLE "task_merges" (
    "id" TEXT NOT NULL,
    "masterTaskId" TEXT NOT NULL,
    "childTaskId" TEXT NOT NULL,
    "mergeMode" "TaskMergeMode" NOT NULL,
    "mergedBy" TEXT NOT NULL,
    "mergedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,

    CONSTRAINT "task_merges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_close_approvals" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_close_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "task_merges_masterTaskId_childTaskId_key" ON "task_merges"("masterTaskId", "childTaskId");
CREATE INDEX "task_merges_childTaskId_idx" ON "task_merges"("childTaskId");
CREATE INDEX "task_merges_mergedBy_idx" ON "task_merges"("mergedBy");
CREATE INDEX "task_merges_mergeMode_idx" ON "task_merges"("mergeMode");
CREATE UNIQUE INDEX "task_close_approvals_taskId_userId_key" ON "task_close_approvals"("taskId", "userId");
CREATE INDEX "task_close_approvals_userId_idx" ON "task_close_approvals"("userId");

-- AddForeignKey
ALTER TABLE "task_merges" ADD CONSTRAINT "task_merges_masterTaskId_fkey" FOREIGN KEY ("masterTaskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_merges" ADD CONSTRAINT "task_merges_childTaskId_fkey" FOREIGN KEY ("childTaskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_merges" ADD CONSTRAINT "task_merges_mergedBy_fkey" FOREIGN KEY ("mergedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "task_close_approvals" ADD CONSTRAINT "task_close_approvals_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_close_approvals" ADD CONSTRAINT "task_close_approvals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
