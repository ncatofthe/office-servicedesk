CREATE TABLE "knowledge_articles" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "category" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_articles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "knowledge_articles_slug_key" ON "knowledge_articles"("slug");
CREATE INDEX "knowledge_articles_category_idx" ON "knowledge_articles"("category");
CREATE INDEX "knowledge_articles_isPublished_idx" ON "knowledge_articles"("isPublished");

ALTER TABLE "knowledge_articles"
ADD CONSTRAINT "knowledge_articles_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "knowledge_articles"
ADD CONSTRAINT "knowledge_articles_updatedById_fkey"
FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
