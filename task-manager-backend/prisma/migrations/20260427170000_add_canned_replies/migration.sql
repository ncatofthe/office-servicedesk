CREATE TYPE "public"."CannedReplyVisibility" AS ENUM ('PRIVATE', 'SHARED');

CREATE TABLE "public"."canned_replies" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "category" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "visibility" "public"."CannedReplyVisibility" NOT NULL DEFAULT 'PRIVATE',
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "canned_replies_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "canned_replies_authorId_visibility_idx" ON "public"."canned_replies"("authorId", "visibility");
CREATE INDEX "canned_replies_category_idx" ON "public"."canned_replies"("category");
CREATE INDEX "canned_replies_isActive_idx" ON "public"."canned_replies"("isActive");

ALTER TABLE "public"."canned_replies"
ADD CONSTRAINT "canned_replies_authorId_fkey"
FOREIGN KEY ("authorId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
