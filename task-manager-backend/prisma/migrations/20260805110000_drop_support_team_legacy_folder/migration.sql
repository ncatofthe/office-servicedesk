-- Drop the legacy single-folder link on support_teams now that
-- support_team_folders (many-to-many) is the sole source of truth.
-- support_team_folders already contains every folder that used to be
-- referenced here (backfilled by 20260425113000_add_support_team_folder_access),
-- so this is a lossless cleanup, not a data migration.

-- DropForeignKey
ALTER TABLE "support_teams" DROP CONSTRAINT "support_teams_folderId_fkey";

-- DropIndex
DROP INDEX "support_teams_folderId_idx";

-- AlterTable
ALTER TABLE "support_teams" DROP COLUMN "folderId";
