-- CreateTable
CREATE TABLE "ticket_folders" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_entities" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_types" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "folderId" TEXT,
    "entityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_subtypes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "typeId" TEXT NOT NULL,
    "folderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_subtypes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_teams" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "folderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_team_members" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT,
    "isLead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_team_members_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN "folderId" TEXT;
ALTER TABLE "tasks" ADD COLUMN "entityId" TEXT;
ALTER TABLE "tasks" ADD COLUMN "typeId" TEXT;
ALTER TABLE "tasks" ADD COLUMN "subtypeId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ticket_folders_name_key" ON "ticket_folders"("name");
CREATE UNIQUE INDEX "ticket_entities_name_key" ON "ticket_entities"("name");
CREATE UNIQUE INDEX "ticket_entities_code_key" ON "ticket_entities"("code");
CREATE UNIQUE INDEX "ticket_types_name_key" ON "ticket_types"("name");
CREATE UNIQUE INDEX "ticket_types_code_key" ON "ticket_types"("code");
CREATE INDEX "ticket_types_folderId_idx" ON "ticket_types"("folderId");
CREATE INDEX "ticket_types_entityId_idx" ON "ticket_types"("entityId");
CREATE UNIQUE INDEX "ticket_subtypes_code_key" ON "ticket_subtypes"("code");
CREATE UNIQUE INDEX "ticket_subtypes_typeId_name_key" ON "ticket_subtypes"("typeId", "name");
CREATE INDEX "ticket_subtypes_folderId_idx" ON "ticket_subtypes"("folderId");
CREATE UNIQUE INDEX "support_teams_name_key" ON "support_teams"("name");
CREATE INDEX "support_teams_folderId_idx" ON "support_teams"("folderId");
CREATE UNIQUE INDEX "support_team_members_teamId_userId_key" ON "support_team_members"("teamId", "userId");
CREATE INDEX "support_team_members_userId_idx" ON "support_team_members"("userId");
CREATE INDEX "tasks_folderId_idx" ON "tasks"("folderId");
CREATE INDEX "tasks_entityId_idx" ON "tasks"("entityId");
CREATE INDEX "tasks_typeId_idx" ON "tasks"("typeId");
CREATE INDEX "tasks_subtypeId_idx" ON "tasks"("subtypeId");

-- AddForeignKey
ALTER TABLE "ticket_types" ADD CONSTRAINT "ticket_types_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "ticket_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ticket_types" ADD CONSTRAINT "ticket_types_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "ticket_entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ticket_subtypes" ADD CONSTRAINT "ticket_subtypes_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "ticket_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ticket_subtypes" ADD CONSTRAINT "ticket_subtypes_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "ticket_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "support_teams" ADD CONSTRAINT "support_teams_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "ticket_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "support_team_members" ADD CONSTRAINT "support_team_members_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "support_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "support_team_members" ADD CONSTRAINT "support_team_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "ticket_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "ticket_entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "ticket_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_subtypeId_fkey" FOREIGN KEY ("subtypeId") REFERENCES "ticket_subtypes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
