ALTER TABLE "tasks"
ADD COLUMN "requesterCloseRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "requesterCloseApprovedAt" TIMESTAMP(3),
ADD COLUMN "requesterCloseApprovedById" TEXT;
