ALTER TABLE "users"
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "users_isActive_idx" ON "users"("isActive");
