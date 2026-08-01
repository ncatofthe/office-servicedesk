# Backend Office ServiceDesk

Актуально на 2026-07-18.

## Стек

- Node.js, Express 5.
- Prisma 5.
- PostgreSQL.
- JWT auth.
- Multer для вложений.

## Команды

```bash
npm --workspace task-manager-backend run dev
npm --workspace task-manager-backend run dev:runtime
npm --workspace task-manager-backend run prisma:validate
npm --workspace task-manager-backend run prisma:migrate:deploy
npm --workspace task-manager-backend run prisma:seed
npm --workspace task-manager-backend run smoke:servicedesk
npm --workspace task-manager-backend run smoke:merge-approval
npm --workspace task-manager-backend run smoke:sla
npm --workspace task-manager-backend run email:smoke
npm --workspace task-manager-backend run email:reply-smoke
npm --workspace task-manager-backend run email:outbox:retry
npm --workspace task-manager-backend run import:freshdesk -- --file /path/to/export.json --dry-run
npm --workspace task-manager-backend run knowledge:smoke
npm --workspace task-manager-backend run backup:create
npm --workspace task-manager-backend run backup:list
npm --workspace task-manager-backend run backup:files:create
npm --workspace task-manager-backend run backup:files:list
```

## Env

- `DATABASE_URL` - PostgreSQL connection string.
- `PORT` - обычно `5001`.
- `JWT_SECRET` - секрет JWT.
- `PUBLIC_REGISTRATION_ENABLED` - разрешает самостоятельную регистрацию заявителей; на рабочем сервере рекомендуется `false`.
- `CORS_ORIGINS` - точные origins frontend через запятую; только схема, хост и необязательный порт. Wildcard `*` запрещён.
- `CORS_ORIGIN` - single-origin alias для простого staging, используется только если `CORS_ORIGINS` не задан.
- `TRUST_PROXY` - доверие reverse proxy для корректного IP клиента. Для Nginx на той же VM используйте `loopback`.
- `RATE_LIMIT_MAX_REQUESTS` - общий лимит запросов на IP за окно `RATE_LIMIT_WINDOW_MS`; для офиса на 15-20 сотрудников рекомендуется `5000`.
- `AUTH_RATE_LIMIT_MAX_REQUESTS` - отдельный лимит входов на IP; для сотрудников за общим NAT рекомендуется `100`.
- `PORTAL_BASE_URL` - базовый URL фронтенда для ссылок в письмах и уведомлениях.
- `UPLOADS_DIR` - абсолютный путь к пользовательским файлам; если пусто, используется `task-manager-backend/uploads`.
- `MAX_UPLOAD_SIZE_MB` - лимит одного web-вложения, по умолчанию `50`.
- `ALLOWED_UPLOAD_MIME_TYPES` - whitelist изображений, офисных документов и архивов.
- `BACKUP_ENABLED` - включает ежедневный scheduler backup.
- `BACKUP_FILES_ENABLED` - вместе с DB dump создаёт архив `UPLOADS_DIR`.
- `BACKUP_DIR` - папка backup, по умолчанию `backups` в корне проекта.
- `BACKUP_RETENTION_DAYS` - сколько дней хранить dump-файлы, по умолчанию `2`.
- `BACKUP_HOUR` / `BACKUP_MINUTE` - локальное время запуска scheduler, по умолчанию `03:00`.
- файловые backup `uploads` используют тот же `BACKUP_DIR`, но кладутся в `BACKUP_DIR/files`.
- `EMAIL_INTAKE_ENABLED` - включает IMAP polling scheduler.
- `EMAIL_IMAP_HOST` / `EMAIL_IMAP_PORT` / `EMAIL_IMAP_SECURE` - параметры IMAP, по умолчанию Яндекс.
- `EMAIL_IMAP_USER` / `EMAIL_IMAP_PASSWORD` - корпоративный ящик.
- `EMAIL_INTAKE_MAILBOX` - папка входящих, по умолчанию `INBOX`.
- `EMAIL_DEFAULT_FOLDER_ID` / `EMAIL_DEFAULT_TYPE_ID` - опциональная маршрутизация email-заявок.
- `EMAIL_OUTBOUND_ENABLED` - включает реальную SMTP-отправку, по умолчанию dry-run.
- `EMAIL_SMTP_HOST` / `EMAIL_SMTP_PORT` / `EMAIL_SMTP_SECURE` - SMTP параметры Яндекс.
- `EMAIL_SMTP_USER` / `EMAIL_SMTP_PASSWORD` / `EMAIL_FROM_ADDRESS` - исходящий ящик.
- `EMAIL_OUTBOUND_RETRY_DELAY_MINUTES` - базовая задержка перед повторной отправкой outbox.
- `EMAIL_OUTBOUND_RETRY_BATCH_LIMIT` - сколько записей outbox обрабатывать за один retry-проход.
- `EMAIL_OUTBOX_WORKER_ENABLED` - включает автоматический outbox worker (по умолчанию выключен).
- `EMAIL_OUTBOX_WORKER_INTERVAL_MS` - интервал фонового retry-прохода.
- `EMAIL_OUTBOX_WORKER_BATCH_SIZE` - размер retry batch для worker.
- `EMAIL_OUTBOX_LOCK_TTL_MS` - TTL lock для конкурентного claim.
- `EMAIL_OUTBOX_MAX_ATTEMPTS` - максимум попыток отправки для одного письма.
- `EMAIL_NOTIFICATIONS_ENABLED` - включает email-уведомления notification center.

Staging runbook: [docs/STAGING_DEPLOY.md](/Users/hatss/Documents/task_bogdan/docs/STAGING_DEPLOY.md)

## Главные маршруты

- `src/routes/auth.routes.js`
- `src/routes/task.routes.js`
- `src/routes/servicedesk.routes.js`
- `src/routes/comment.routes.js`
- `src/routes/file.routes.js`
- `src/routes/dashboard.routes.js`
- `src/routes/reports.routes.js`

Не подключены в runtime:

- `src/routes/finance.routes.js` - legacy finance API старого task-manager контура.
- `src/routes/review.routes.js` - legacy approval/payment API старого task-manager контура.

Файлы контроллеров/сервисов и Prisma-модели сохранены как legacy-code/data compatibility, но активный HTTP API их не монтирует.

## ServiceDesk

Справочники доступны всем авторизованным на чтение через `/api/servicedesk/*`. CRUD находится в `/api/servicedesk/admin/*` и доступен `ADMIN`.

Singleton ProductSettings:

- `GET /api/servicedesk/product-settings` - публичный public-safe payload без token для брендирования Login/Register;
- `GET /api/servicedesk/admin/product-settings` - admin payload с metadata;
- `PATCH /api/servicedesk/admin/product-settings` - частичное обновление;
- содержит только название портала/компании, приветствие, locale, timezone, приоритет и активную папку по умолчанию;
- не содержит секретов и deployment-настроек;
- значения по умолчанию применяются только если `folderId`/`priority` не переданы при создании заявки.

Read-only справочники возвращают только данные, нужные рабочим формам. Состав команд, email участников и служебные aggregate counts доступны только через admin API. Backend также блокирует несовместимые связи `type/subtype/folder`, неактивных исполнителей и удаление папки, пока она используется командой.

Матрица настраиваемости и граница между admin-настройками и server env описаны в [ADMIN_CONFIGURATION_AUDIT.md](./ADMIN_CONFIGURATION_AUDIT.md).

SLA policy теперь живёт в этом же admin-контуре:

- `GET /api/servicedesk/admin/sla-policies`
- `POST /api/servicedesk/admin/sla-policies`
- `PUT /api/servicedesk/admin/sla-policies/:id`
- `DELETE /api/servicedesk/admin/sla-policies/:id`
- `POST /api/servicedesk/admin/sla-policies/:id/test`

Automation rules v1 тоже живут в admin-контуре:

- `/api/servicedesk/admin/automation-rules`
- `/api/servicedesk/admin/automation-runs`
- `/api/servicedesk/admin/email-outbox`
- `/api/servicedesk/admin/email-health`

Подробная спецификация: `docs/AUTOMATION_RULES.md`.

### Folder/team permissions

Новая модель доступа строится так:

- `SupportTeamMember` задаёт участие пользователя в команде;
- `SupportTeamFolder` задаёт папки, доступные команде;
- `AGENT` получает видимость очереди по объединению папок всех своих команд;
- назначение исполнителем даёт доступ к конкретной заявке даже вне штатной папки команды.

## Заявки

`POST /api/tasks` доступен `ADMIN`, `AGENT`, `REQUESTER`.

- `ADMIN` управляет всеми заявками.
- `AGENT` читает только папки своих команд и назначенные ему заявки.
- `AGENT` редактирует карточку и исполнителей только в рамках папок своей команды.
- `REQUESTER` видит только свои заявки.
- `VIEWER` остаётся read-only.

## Notification center

Доступные endpoint:

- `GET /api/notifications`
- `GET /api/notifications/unread-count`
- `PATCH /api/notifications/:id/read`
- `PATCH /api/notifications/read-all`

Что покрыто сейчас:

- новая заявка для агентов папки;
- ответ заявителя;
- публичный комментарий исполнителя;
- внутренняя заметка для исполнителей;
- назначение исполнителя;
- смена статуса;
- merge;
- важные ошибки outbox.

Dedupe делается через `eventKey`, а email-уведомления используют существующий outbox/retry контур. Подробности: `docs/NOTIFICATIONS.md`.

## Reports

`GET /api/reports` оставлен как ServiceDesk statistics endpoint для `ADMIN` и `VIEWER`.

`AGENT` не имеет доступа к full reports и получает `403`: текущая выдача содержит общую статистику по сотрудникам и папкам, а scoped reports по folder/team permissions пока не реализованы.

Текущая выдача строится только вокруг ServiceDesk:

- распределение заявок по статусам;
- нагрузка по папкам;
- рейтинг закрытия по пользователям;
- просроченные заявки по `dueDate`;
- активность публичных комментариев и internal notes;
- SLA summary по first response и resolution.

Finance-метрики, расходы, accounts и transactions из reports убраны.

## Departments compatibility

`Department` остаётся backend compatibility-layer для старых профилей пользователей и membership-данных. Новая целевая модель очередей - `TicketFolder` + `SupportTeam` + `SupportTeamFolder`.

Для новых ServiceDesk сценариев не использовать `departmentId` как замену `folderId`. Старые endpoints `/api/departments*` оставлены, чтобы не ломать profile/admin compatibility.

### Automation engine v1

Backend запускает automation rules только в двух точках:

- после обычного `POST /api/tasks` как trigger `TASK_CREATED`;
- после email intake создания заявки как trigger `EMAIL_TICKET_CREATED`.

Первая версия специально не generic:

- rule conditions и actions хранятся explicit columns в `automation_rules`;
- run log хранится отдельно в `automation_runs`;
- update/edit/status transitions automation пока не запускают;
- каждая rule работает по уже обновлённому состоянию заявки;
- невалидные action-комбинации не ломают создание заявки: rule пишет `ERROR` в run log, а сама заявка сохраняется.

## Merge

Canonical backend contract:

- `POST /api/tasks/:id/merge`
- `GET /api/tasks/:id/merge-info`
- `POST /api/tasks/:id/close-approve`

Smoke: `npm --workspace task-manager-backend run smoke:merge-approval`.

## SLA

Backend рассчитывает SLA при создании заявки и при изменении её классификации/priority. First response засчитывается от `ADMIN`/`AGENT` по первому комментарию или `email-reply`. Resolution SLA обновляется при `DONE` и reopen.

Отдельного scheduler для breach пока нет: SLA статус считается live при чтении и обновлениях. Подробности: `docs/SLA.md`.

## Комментарии и internal notes

Комментарий поддерживает `visibility=PUBLIC|INTERNAL`.

- `ADMIN` и `AGENT` видят оба типа и могут создавать оба типа.
- `REQUESTER` и `VIEWER` видят только `PUBLIC`.
- `REQUESTER` может создавать только `PUBLIC`.
- `VIEWER` не создаёт комментарии.

Task detail serializer возвращает `comments[].visibility`.

Internal note тоже засчитывается как first response для SLA, если это первый комментарий от `ADMIN` или `AGENT`. Email reply остаётся публичным комментарием.

## Product timeline заявки

Backend теперь ведёт отдельную продуктовую историю заявки через `TaskTimelineEvent`.

V1 покрывает:

- создание заявки
- обновление заявки
- смену статуса
- публичные комментарии
- внутренние заметки
- назначение и снятие исполнителя
- вложения
- canned replies
- email replies
- merge
- close approval
- automation applied
- SLA policy applied

Timeline читается через:

- `GET /api/tasks/:id/timeline`

Доступ совпадает с обычным доступом к заявке. Для `REQUESTER` и `VIEWER` backend скрывает `INTERNAL_NOTE_ADDED` и режет metadata до безопасного уровня.

Timeline создаётся в service-layer, а не только в контроллерах. Для не-критичных мест используется безопасная запись, которая не ломает основное действие, если timeline сам по себе не записался. Подробности: `docs/TASK_TIMELINE.md`.

## Canned replies

Backend поддерживает canned replies через отдельный API:

- `GET /api/canned-replies`
- `GET /api/canned-replies/:id`
- `POST /api/canned-replies`
- `PUT /api/canned-replies/:id`
- `DELETE /api/canned-replies/:id`

Visibility:

- `PRIVATE` видит и использует только автор.
- `SHARED` видят и используют все `ADMIN` и `AGENT`.

Редактирование и удаление:

- `ADMIN` управляет любым шаблоном.
- `AGENT` управляет только своими шаблонами.

Для применения к задаче используется:

- `POST /api/tasks/:id/reply-from-template`

Режимы:

- `COMMENT` создаёт `PUBLIC` комментарий и использует текущую comment/SLA логику.
- `EMAIL_REPLY` использует текущий outbound email flow и dry-run поведение.

Шаблон сохраняет `body` как есть, без templating engine и без подстановки переменных. Подробности: `docs/CANNED_REPLIES.md`.

## Backup

Ручные команды:

- `npm --workspace task-manager-backend run backup:create`
- `npm --workspace task-manager-backend run backup:list`
- `npm --workspace task-manager-backend run backup:cleanup`
- `npm --workspace task-manager-backend run backup:next-run`
- `npm --workspace task-manager-backend run backup:restore -- <dump-file> --yes`
- `npm --workspace task-manager-backend run backup:files:create`
- `npm --workspace task-manager-backend run backup:files:list`
- `npm --workspace task-manager-backend run backup:files:cleanup`
- `npm --workspace task-manager-backend run backup:files:restore -- <archive> [target-dir] [--yes]`

Автоматический scheduler запускается вместе с backend только при `BACKUP_ENABLED=true` и сейчас покрывает PostgreSQL. Файловые backup выполняются отдельной ops-командой. Подробности: `docs/BACKUPS.md`.

## Email intake

Ручные команды:

- `npm --workspace task-manager-backend run email:smoke` - локальная проверка без Яндекса.
- `npm --workspace task-manager-backend run email:sync` - one-shot синхронизация реального IMAP-ящика.

Автоматический polling запускается вместе с backend только при `EMAIL_INTAKE_ENABLED=true`. Повторная обработка писем блокируется таблицей `email_inbound_messages`.

После создания email-заявки backend дополнительно прогоняет automation rules с trigger `EMAIL_TICKET_CREATED`.

## Email reply

- `POST /api/tasks/:id/email-reply`
- `GET /api/tasks/:id/email-thread`
- `GET /api/servicedesk/admin/email-outbox?status=&taskId=`
- `POST /api/servicedesk/admin/email-outbox/:id/retry`
- `npm --workspace task-manager-backend run email:reply-smoke`
- `npm --workspace task-manager-backend run email:outbox:retry`

По умолчанию работает dry-run и реальные письма не отправляет. При любом `email-reply`/`reply-from-template` (mode `EMAIL_REPLY`) backend создаёт outbox-запись в `email_outbound_messages`, поэтому письмо и статус отправки не теряются.

Статусы outbox:

- `DRY_RUN` - SMTP отключён, отправка не выполняется.
- `SENT` - SMTP отправка успешна.
- `RETRY_PENDING` - отправка упала, запись ждёт retry.
- `FAILED` - статус зарезервирован для ручной диагностики/фиксации ошибок.

Threading строится по последнему `EmailInboundMessage` заявки + последнему outbound `messageId`:

- subject нормализуется в `Re: ...`
- проставляются `In-Reply-To` и `References`
- сохраняется связь inbound -> outbound -> task.

`REQUESTER` в `GET /api/tasks/:id/email-thread` не видит технические SMTP поля (`errorMessage`, retry-поля, internal status), а `ADMIN/AGENT` видят полный delivery-статус.

## Freshdesk import и external references

В backend добавлен foundation для внешних ссылок:

- `TaskExternalReference.system = FRESHDESK`
- `TaskExternalReference.system = ONE_C`

Основной Freshdesk import использует API v2:

```bash
npm --workspace task-manager-backend run import:freshdesk:api -- --dry-run --max-tickets 20
```

Файловый режим сохранён для совместимости:

```bash
npm --workspace task-manager-backend run import:freshdesk -- --file /path/to/export.json --dry-run
```

Поддерживается:

- dry-run;
- idempotent rerun;
- Freshdesk API v2 и JSON/CSV;
- исходные даты, requester/responder, groups и все conversations;
- public/internal comments;
- сохранение `externalId` и `externalNumber`;
- явный `sourceChannel=WEB|EMAIL`;
- опциональная безопасная загрузка бинарных вложений только из API pull;
- журнал `FreshdeskImportRun`.

Подробности: `docs/FRESHDESK_IMPORT.md`.

## Knowledge base

- `/api/knowledge/articles`
- `npm --workspace task-manager-backend run knowledge:smoke`

Читать опубликованные статьи могут все авторизованные. Управление доступно `ADMIN`, `AGENT`.

## Роли

Базовая ролевая модель MVP:

- `ADMIN` - полный доступ и настройки.
- `AGENT` - исполнитель, очередь, комментарии, база знаний.
- `REQUESTER` - создание заявок и просмотр своих обращений.
- `VIEWER` - read-only роль для наблюдения и архива.

Новая продуктовая модель для backend API управления ролями:

- `ADMIN`
- `AGENT`
- `REQUESTER`

Legacy-роли остаются только как compatibility-layer и нормализуются сервером.

## Миграции

- `20260421120000_add_servicedesk_phase1` - справочники ServiceDesk.
- `20260422110000_add_task_merge_approval` - merge, approvals, статус `MERGED`.
- `20260422143000_add_email_intake` - учёт обработанных email и связь письмо -> заявка.
- `20260423120000_add_knowledge_articles` - база знаний.
- `20260425113000_add_support_team_folder_access` - доступ команд к нескольким папкам.
- `20260426110000_add_automation_rules` - automation rules, execution log и backend-first contract для dispatch rules.
- `20260517173000_add_email_outbox_reliability` - persistent outbox, delivery statuses и retry foundation.
- `20260603110000_add_notifications_import_foundation` - notification center foundation, external references и Freshdesk import run log.
- `20260719100000_add_task_source_channel_attachment_refs` - явный канал заявки, ссылки на импортированные вложения и блокировка параллельного Freshdesk import.

## Правило доработок

Любой новый endpoint получает route validation, controller handler, service method, serializer при необходимости и smoke/manual проверку.
