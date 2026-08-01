DROP INDEX IF EXISTS "task_comments_taskId_visibility_idx";

CREATE INDEX "tasks_updatedAt_idx"
ON "tasks"("updatedAt");

CREATE INDEX "tasks_status_updatedAt_idx"
ON "tasks"("status", "updatedAt");

CREATE INDEX "tasks_authorId_updatedAt_idx"
ON "tasks"("authorId", "updatedAt");

CREATE INDEX "knowledge_articles_isPublished_updatedAt_idx"
ON "knowledge_articles"("isPublished", "updatedAt");

CREATE INDEX "task_assignees_userId_taskId_idx"
ON "task_assignees"("userId", "taskId");

CREATE INDEX "task_comments_taskId_visibility_createdAt_idx"
ON "task_comments"("taskId", "visibility", "createdAt");

CREATE INDEX "task_timeline_events_type_createdAt_idx"
ON "task_timeline_events"("type", "createdAt");
