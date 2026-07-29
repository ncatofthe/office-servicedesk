CREATE TABLE "product_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "portalName" TEXT NOT NULL DEFAULT 'Office ServiceDesk',
    "companyName" TEXT NOT NULL DEFAULT '',
    "welcomeMessage" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'ru-RU',
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Moscow',
    "defaultPriority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "defaultFolderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_settings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "product_settings_singleton" CHECK ("id" = 'default')
);

CREATE INDEX "product_settings_defaultFolderId_idx"
ON "product_settings"("defaultFolderId");

ALTER TABLE "product_settings"
ADD CONSTRAINT "product_settings_defaultFolderId_fkey"
FOREIGN KEY ("defaultFolderId") REFERENCES "ticket_folders"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "product_settings" ("id") VALUES ('default');
