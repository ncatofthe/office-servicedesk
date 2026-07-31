ALTER TABLE "email_settings"
ALTER COLUMN "intakePollIntervalMs" SET DEFAULT 15000;

UPDATE "email_settings"
SET "intakePollIntervalMs" = 15000
WHERE "intakePollIntervalMs" = 300000;
