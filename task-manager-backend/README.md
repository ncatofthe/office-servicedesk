# Office ServiceDesk Backend

Актуально на 2026-06-10.

Express/Prisma backend для Office ServiceDesk.

Staging checklist: [docs/STAGING_DEPLOY.md](/Users/hatss/Documents/task_bogdan/docs/STAGING_DEPLOY.md)

## Start

```bash
cd /Users/hatss/Documents/task_bogdan
npm --workspace task-manager-backend run prisma:migrate:deploy
npm --workspace task-manager-backend run prisma:seed
npm run dev:backend
```

## Scripts

- `npm run dev` - dev server.
- `npm run dev:runtime` - dev server with contracts build.
- `npm run start` - production-like start.
- `npm run prisma:validate` - validate schema.
- `npm run prisma:migrate:deploy` - apply migrations.
- `npm run prisma:seed` - demo data.
- `npm run smoke:servicedesk` - ServiceDesk smoke.
- `npm run smoke:canned-replies` - canned replies smoke.
- `npm run smoke:merge-approval` - merge and close approval smoke.
- `npm run smoke:sla` - SLA foundation smoke.
- `npm run email:smoke` - local email intake smoke without IMAP credentials.
- `npm run email:reply-smoke` - local email reply smoke in dry-run mode.
- `npm run email:sync` - one-shot IMAP sync for configured mailbox.
- `npm run email:outbox:retry` - retry pending outbound emails from persistent outbox.
- `npm run email:yandex:check` - безопасная диагностика Yandex IMAP/SMTP env без отправки письма.
- `npm run import:freshdesk -- --file /path/to/export.json --dry-run` - dry-run/import из Freshdesk.
- `npm run import:freshdesk:api -- --dry-run --max-tickets 20` - рекомендуемый пилотный перенос через Freshdesk API v2.
- `npm run backup:create` - create PostgreSQL dump.
- `npm run backup:list` - list created dumps.
- `npm run backup:cleanup` - remove expired dumps by retention.
- `npm run backup:next-run` - show scheduler config and next run.
- `npm run backup:restore -- <dump-file> --yes` - restore dump.
- `npm run backup:files:create` - archive `uploads` into `backups/files`.
- `npm run backup:files:list` - list uploads archives.
- `npm run backup:files:cleanup` - remove expired uploads archives by retention.
- `npm run backup:files:restore -- <archive> [target-dir] [--yes]` - restore uploads archive.

## Main API groups

- `/api/auth`
- `/api/tasks`
- `/api/servicedesk`
- `/api/comments`
- `/api/files`
- `/api/dashboard`
- `/api/reports`

Finance/review API старого task-manager контура (`/api/accounts`, `/api/transactions`, `/api/reviews`) не подключены в runtime. Исторические Prisma-модели и миграции сохранены для совместимости данных и безопасных rollback-сценариев, но не являются активной частью продукта.

## Canonical ServiceDesk contracts

- Task fields: `folderId`, `entityId`, `typeId`, `subtypeId`.
- Task SLA block: `sla.policy`, `sla.firstResponseDueAt`, `sla.resolutionDueAt`, `sla.firstResponseAt`, `sla.resolvedAt`, `sla.firstResponseStatus`, `sla.resolutionStatus`.
- Dictionaries read: `/api/servicedesk/*`.
- Dictionaries admin CRUD: `/api/servicedesk/admin/*`.
- SLA admin CRUD: `/api/servicedesk/admin/sla-policies`.
- Merge: `POST /api/tasks/:id/merge`.
- Merge info: `GET /api/tasks/:id/merge-info`.
- Close approval: `POST /api/tasks/:id/close-approve`.
- Email reply: `POST /api/tasks/:id/email-reply` with `{ "message": "..." }`.
- Email thread: `GET /api/tasks/:id/email-thread`.
- Email outbox admin: `GET /api/servicedesk/admin/email-outbox`, `POST /api/servicedesk/admin/email-outbox/:id/retry`, `GET /api/servicedesk/admin/email-health`.
- Freshdesk import admin: `POST /api/servicedesk/admin/freshdesk-import/dry-run`, `POST /api/servicedesk/admin/freshdesk-import`, `GET /api/servicedesk/admin/freshdesk-import/runs`.
- Notifications API: `GET /api/notifications`, `GET /api/notifications/unread-count`, `PATCH /api/notifications/:id/read`, `PATCH /api/notifications/read-all`.
- Canned replies: `/api/canned-replies`.
- Template apply: `POST /api/tasks/:id/reply-from-template`.
- Product timeline: `GET /api/tasks/:id/timeline`.

## Legacy compatibility

- `/api/departments` оставлен как backend compatibility-layer для старых профилей и membership-сценариев. Для новых очередей ServiceDesk использовать `/api/servicedesk/folders`.
- `TaskReview`, `Account`, `Transaction` остаются в Prisma schema как исторические таблицы. Активные HTTP endpoints для них отключены.
- `reports` теперь возвращает ServiceDesk-статистику по заявкам, SLA, комментариям и папкам без финансовых метрик. Доступ к `/api/reports` ограничен ролями `ADMIN` и `VIEWER`.

## Product roles

Целевая продуктовая модель:

- `ADMIN`
- `AGENT`
- `REQUESTER`

Legacy-роли оставлены только для совместимости старых данных, но новые role-management сценарии используют только эти три роли.

## Notification center

Backend поддерживает portal notifications и опциональные email-уведомления через outbox.

- новая заявка уведомляет агентов папки;
- публичный ответ исполнителя уведомляет заявителя;
- внутренняя заметка не уходит заявителю;
- есть unread count и read-all;
- dedupe делается через `eventKey`.

## Automation rules v1

Backend-first foundation already includes:

- admin CRUD: `/api/servicedesk/admin/automation-rules`
- execution log: `/api/servicedesk/admin/automation-runs`
- dry-run: `POST /api/servicedesk/admin/automation-rules/:id/test`
- runtime triggers: `TASK_CREATED`, `EMAIL_TICKET_CREATED`

Подробности: [../docs/AUTOMATION_RULES.md](../docs/AUTOMATION_RULES.md)

## Database

Prisma schema includes ServiceDesk dictionaries, task merge records and close approvals. Current important migrations:

- `20260421120000_add_servicedesk_phase1`
- `20260422110000_add_task_merge_approval`
- `20260422143000_add_email_intake`
- `20260426110000_add_automation_rules`
- `20260427150000_add_internal_comment_visibility`
- `20260427170000_add_canned_replies`

## Health

`GET /health` checks server and DB connection.

## Backups

Two backup contours are supported:

- PostgreSQL dumps through `scripts/db-backup.js`.
- Uploads archives through `scripts/files-backup.js`.

Default root directory is `/Users/hatss/Documents/task_bogdan/backups`:

- DB dumps live directly in `backups/`
- uploads archives live in `backups/files/`

Automatic daily scheduler covers PostgreSQL only and starts with the server when `BACKUP_ENABLED=true`. Uploads backup is intentionally a separate manual/ops command for the local-server deployment model.

## Email intake

Email intake is available through `scripts/email-intake-sync.js` and `src/services/email-intake.service.js`. Automatic polling starts with the server only when `EMAIL_INTAKE_ENABLED=true`. Yandex defaults are used for IMAP host/port, but credentials must be configured in `.env`.

## Email replies

Email replies use `src/services/email-outbound.service.js` and `nodemailer`. Outbound SMTP is disabled by default with `EMAIL_OUTBOUND_ENABLED=false`; in this mode API/service calls create the internal task comment and return `dryRun=true` without sending a real email.

Каждый `email-reply` и `reply-from-template` в режиме `EMAIL_REPLY` создаёт запись в persistent outbox (`email_outbound_messages`), поэтому отправка и ошибки не теряются. В записи хранится полный `bodyText` и укороченный `textPreview`.

For production SMTP configure:

- `EMAIL_OUTBOUND_ENABLED=true`
- `EMAIL_SMTP_HOST=smtp.yandex.ru`
- `EMAIL_SMTP_PORT=465`
- `EMAIL_SMTP_SECURE=true`
- `EMAIL_SMTP_USER`
- `EMAIL_SMTP_PASSWORD`
- `EMAIL_FROM_ADDRESS`
- `EMAIL_FROM_NAME=Office ServiceDesk`
- `EMAIL_OUTBOUND_RETRY_DELAY_MINUTES=15`
- `EMAIL_OUTBOUND_RETRY_BATCH_LIMIT=50`
- `EMAIL_OUTBOX_WORKER_ENABLED=false`
- `EMAIL_OUTBOX_WORKER_INTERVAL_MS=60000`
- `EMAIL_OUTBOX_WORKER_BATCH_SIZE=20`
- `EMAIL_OUTBOX_LOCK_TTL_MS=300000`
- `EMAIL_OUTBOX_MAX_ATTEMPTS=5`

Reply threading is based on the latest `EmailInboundMessage` for the task: recipient is `fromEmail`, subject is `Re: ...`, and `In-Reply-To`/`References` are populated from inbound `messageId` (plus last outbound `messageId`, if present).

Outbox retry uses DB lock/claim (`lockedAt`, `lockedBy`) with TTL to protect from duplicate sends in parallel runs (worker + CLI + manual retry). `SENT` and `DRY_RUN` are never resent; only `FAILED`/`RETRY_PENDING` are retryable.

Automatic outbox worker is disabled by default, so dev/e2e/test do not start background retries unless explicitly enabled.

Notification emails use the same outbox foundation. Дополнительные env:

- `EMAIL_NOTIFICATIONS_ENABLED`
- `PORTAL_BASE_URL`

Admin outbox list has safe limit clamp:

- default: `50`
- max: `100`
- invalid or negative `limit` falls back to default.

Email health endpoint (`GET /api/servicedesk/admin/email-health`) returns safe diagnostics: worker/outbound flags, retry config, outbox counts, retryable/locked counts, oldest pending timestamp, and masked SMTP fields (`hostMasked`, `userMasked`, `fromAddressMasked`).

Yandex readiness можно проверить без отправки письма:

```bash
npm --workspace task-manager-backend run email:yandex:check
npm --workspace task-manager-backend run email:yandex:check -- --connect-imap --verify-smtp
```

## Canned replies

Canned replies are managed through `/api/canned-replies`.

- `PRIVATE` templates are visible and usable only by the author.
- `SHARED` templates are visible and usable by all `ADMIN` and `AGENT`.
- `POST /api/tasks/:id/reply-from-template` applies a template in `COMMENT` or `EMAIL_REPLY` mode.

Template `body` is stored as-is in this phase. Variable substitution and template engines are intentionally postponed.

## SLA

SLA foundation is backend-first in this phase: policies are configured through admin API, matched by `sortOrder ASC`, and applied to tasks by `folderId/typeId/subtypeId/priority`. First response is captured from the first `ADMIN`/`AGENT` comment or `email-reply`, while resolution is tracked on `DONE` and admin reopen.

## Freshdesk import

Есть рабочий контур переноса заявок из Freshdesk:

- dry-run;
- idempotent rerun;
- прямой Freshdesk API v2 и резервный JSON/CSV;
- сохранение `externalId` и `externalNumber`;
- перенос исходных дат, канала, requester/responder и всех conversations;
- import public/internal comments;
- безопасная опциональная загрузка бинарных вложений при API-import;
- лог запуска `FreshdeskImportRun`.
- sample JSON/CSV: `samples/freshdesk-import-sample.json`, `samples/freshdesk-import-sample.csv`.
- admin JSON API для dry-run/import/recent runs.

Пилот: `npm run import:freshdesk:api -- --dry-run --max-tickets 20`.

Подробности: [../docs/FRESHDESK_IMPORT.md](../docs/FRESHDESK_IMPORT.md)
