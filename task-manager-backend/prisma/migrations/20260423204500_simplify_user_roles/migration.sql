CREATE TYPE "UserRole_new" AS ENUM ('ADMIN', 'AGENT', 'REQUESTER', 'VIEWER');

ALTER TABLE "users"
    ALTER COLUMN "role" DROP DEFAULT;

ALTER TABLE "users"
    ALTER COLUMN "role" TYPE "UserRole_new"
    USING (
        CASE
            WHEN "role"::text = 'ADMIN' THEN 'ADMIN'
            WHEN "role"::text IN ('DIRECTOR', 'MANAGER', 'EMPLOYEE', 'FINANCE') THEN 'AGENT'
            WHEN "role"::text = 'VIEWER' THEN 'VIEWER'
            ELSE 'REQUESTER'
        END
    )::"UserRole_new";

DROP TYPE "UserRole";

ALTER TYPE "UserRole_new" RENAME TO "UserRole";

ALTER TABLE "users"
    ALTER COLUMN "role" SET DEFAULT 'REQUESTER';
