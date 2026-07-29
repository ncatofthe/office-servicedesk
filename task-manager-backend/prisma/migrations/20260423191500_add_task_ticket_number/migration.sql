CREATE SEQUENCE "tasks_ticket_number_seq";

ALTER TABLE "tasks"
ADD COLUMN "ticket_number" INTEGER;

WITH ordered_tasks AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt" ASC, "id" ASC) AS "ticket_number"
  FROM "tasks"
)
UPDATE "tasks" AS "target"
SET "ticket_number" = "ordered_tasks"."ticket_number"
FROM "ordered_tasks"
WHERE "target"."id" = "ordered_tasks"."id";

SELECT setval(
  'tasks_ticket_number_seq',
  COALESCE((SELECT MAX("ticket_number") FROM "tasks"), 0) + 1,
  false
);

ALTER TABLE "tasks"
ALTER COLUMN "ticket_number" SET DEFAULT nextval('tasks_ticket_number_seq'),
ALTER COLUMN "ticket_number" SET NOT NULL;

ALTER SEQUENCE "tasks_ticket_number_seq" OWNED BY "tasks"."ticket_number";

CREATE UNIQUE INDEX "tasks_ticket_number_key" ON "tasks"("ticket_number");
