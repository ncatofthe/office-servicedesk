CREATE TABLE "support_team_folders" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_team_folders_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "support_team_folders_teamId_folderId_key" ON "support_team_folders"("teamId", "folderId");
CREATE INDEX "support_team_folders_folderId_idx" ON "support_team_folders"("folderId");

ALTER TABLE "support_team_folders"
ADD CONSTRAINT "support_team_folders_teamId_fkey"
FOREIGN KEY ("teamId") REFERENCES "support_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "support_team_folders"
ADD CONSTRAINT "support_team_folders_folderId_fkey"
FOREIGN KEY ("folderId") REFERENCES "ticket_folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "support_team_folders" ("id", "teamId", "folderId", "createdAt", "updatedAt")
SELECT
    'stf_' || md5("id" || ':' || "folderId"),
    "id",
    "folderId",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "support_teams"
WHERE "folderId" IS NOT NULL
ON CONFLICT ("teamId", "folderId") DO NOTHING;
