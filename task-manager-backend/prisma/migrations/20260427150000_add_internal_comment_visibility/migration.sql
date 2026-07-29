CREATE TYPE "CommentVisibility" AS ENUM ('PUBLIC', 'INTERNAL');

ALTER TABLE "task_comments"
ADD COLUMN "visibility" "CommentVisibility" NOT NULL DEFAULT 'PUBLIC';

CREATE INDEX "task_comments_taskId_visibility_idx" ON "task_comments"("taskId", "visibility");
