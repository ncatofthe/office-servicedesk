# API Overview

Актуально на 2026-07-18. Base URL: `/api`.

## Product roles

- `ADMIN` - администратор
- `AGENT` - исполнитель
- `REQUESTER` - заявитель

Legacy-роли (`DIRECTOR`, `MANAGER`, `EMPLOYEE`, `USER`, `VIEWER`) сохранены только для совместимости старых данных. Новый API управления ролями работает с `ADMIN | AGENT | REQUESTER`.

## Auth

- `GET /auth/config` - публичные настройки login flow (`publicRegistrationEnabled`).
- `POST /auth/register` - регистрация заявителя.
- `POST /auth/register/admin` - создание пользователя админом.
- `POST /auth/login` - получить JWT.
- `GET /auth/me` - текущий пользователь.
- `POST /auth/logout` - завершение сессии и отзыв JWT на сервере.

Управление доступом (`ADMIN`):

- `PATCH /users/:id/status` с `{ "isActive": false }` отключает вход и отзывает активные JWT пользователя;
- `PATCH /users/:id/password` (только `ADMIN`) назначает новый пароль от 10 символов и отзывает все старые JWT; hash не возвращается;
- повторный вызов с `true` возвращает доступ без удаления истории заявок;
- публичная регистрация на рабочем сервере управляется `PUBLIC_REGISTRATION_ENABLED`.

## ServiceDesk справочники

### Product settings

- `GET /servicedesk/product-settings` - публичные безопасные настройки для брендирования Login/Register до входа; token не требуется.
- `GET /servicedesk/admin/product-settings` - тот же payload с `id`, `createdAt`, `updatedAt`, только `ADMIN`.
- `PATCH /servicedesk/admin/product-settings` - частичное обновление singleton-настроек, только `ADMIN`.

Public-safe response:

```json
{
  "portalName": "Office ServiceDesk",
  "companyName": "Компания",
  "welcomeMessage": "Опишите проблему, и мы поможем.",
  "locale": "ru-RU",
  "timezone": "Europe/Moscow",
  "defaultPriority": "MEDIUM",
  "defaultFolderId": "folder_id_or_null",
  "defaultFolder": {
    "id": "folder_id",
    "name": "Общая поддержка"
  }
}
```

Если папка по умолчанию не выбрана, `defaultFolderId` и `defaultFolder` равны `null`. Admin response дополнительно содержит:

```json
{
  "id": "default",
  "createdAt": "2026-07-19T17:00:00.000Z",
  "updatedAt": "2026-07-19T17:00:00.000Z"
}
```

Пример PATCH:

```json
{
  "portalName": "Портал поддержки",
  "companyName": "ООО Компания",
  "welcomeMessage": "Опишите вопрос и приложите файлы при необходимости.",
  "locale": "ru-RU",
  "timezone": "Europe/Moscow",
  "defaultPriority": "MEDIUM",
  "defaultFolderId": "folder_id_or_null"
}
```

SMTP/IMAP/Freshdesk secrets, CORS/JWT, пути, rate limits и feature flags в ProductSettings отсутствуют намеренно. При создании заявки без `folderId` применяется `defaultFolderId`, а без `priority` - `defaultPriority`. Явные `folderId: null` и `priority` имеют приоритет над defaults.

Read-only для всех авторизованных пользователей:

- `GET /servicedesk/folders`
- `GET /servicedesk/entities`
- `GET /servicedesk/types`
- `GET /servicedesk/subtypes`
- `GET /servicedesk/teams`

Read-only payload не содержит состава команд, email исполнителей и служебных aggregate counts. Эти данные доступны только `ADMIN` через managed endpoints.

Admin CRUD:

- `/servicedesk/admin/folders`
- `/servicedesk/admin/entities`
- `/servicedesk/admin/types`
- `/servicedesk/admin/subtypes`
- `/servicedesk/admin/teams`
- `/servicedesk/admin/teams/:teamId/members`
- `/servicedesk/admin/team-members/:id`
- `/servicedesk/admin/sla-policies`
- `/servicedesk/admin/automation-rules`
- `/servicedesk/admin/automation-runs`
- `/servicedesk/admin/email-outbox`
- `/servicedesk/admin/freshdesk-import`

Admin CRUD проверяет целостность конфигурации: папка подтипа должна соответствовать типу, SLA-ссылки должны образовывать совместимую комбинацию, участниками команд и исполнителями могут быть только активные `ADMIN / AGENT`, а удаление используемых справочников блокируется.

Email outbox admin API:

- `GET /servicedesk/admin/email-outbox?status=&taskId=&limit=`
- `GET /servicedesk/admin/email-health`
- `POST /servicedesk/admin/email-outbox/:id/retry`

Frontend usage notes:

- `/tickets` использует inbox/list как основной рабочий экран.
- `TaskDetailsModal` показывает email thread, canned replies, knowledge и timeline внутри одной helpdesk-карточки.
- `Layout` использует notifications API для bell/dropdown/drawer с defensive fallback.

Статусы outbox:

- `DRY_RUN`
- `SENT`
- `FAILED`
- `RETRY_PENDING`

Retry policy и конкурентная безопасность:

- `SENT` и `DRY_RUN` не переотправляются.
- Ретраятся только `FAILED` и `RETRY_PENDING`.
- При `attempts >= EMAIL_OUTBOX_MAX_ATTEMPTS` запись перестаёт ретраиться.
- Outbox retry использует lock/claim с TTL (`lockedAt`, `lockedBy`) для защиты от двойной отправки при параллельных запусках.

Team payload дополнительно поддерживает:

- `folderIds: string[]` - список папок, доступных команде;
- `folderId` - legacy primary folder, сохраняется для совместимости и автоматически синхронизируется с первым элементом `folderIds`.

Legacy GET aliases:

- `GET /service-desk/ticket-types`
- `GET /service-desk/ticket-subtypes`
- `GET /service-desk/entities`
- `GET /service-desk/teams`

## Tasks

- `GET /tasks` - список с серверной пагинацией, поиском, фильтрами и сортировкой.
- `GET /tasks/:id` - детальная заявка, включая `mergeInfo`.
- `GET /tasks/:id/email-thread` - история inbound/outbound email по заявке.
- `POST /tasks` - создать заявку. Доступ: `ADMIN`, `AGENT`, `REQUESTER`.
- `PUT /tasks/:id` - обновить заявку. Доступ: `ADMIN`, `AGENT`.
- `PATCH /tasks/:id/status` - сменить статус.
- `POST /tasks/:id/assignees` - добавить исполнителя.
- `DELETE /tasks/:id/assignees/:userId` - снять исполнителя.

Ограничения доступа:

- `ADMIN` видит и управляет всеми заявками.
- `AGENT` видит заявки из папок своих команд и заявки, где он назначен.
- `AGENT` меняет статус по доступной папке или по собственному назначению.
- `AGENT` редактирует поля заявки и управляет исполнителями только по заявкам из папок своей команды.
- `REQUESTER` видит только свои заявки.
- `VIEWER` читает данные без изменения.

ServiceDesk поля заявки:

- `folderId`
- `entityId`
- `typeId`
- `subtypeId`

Дополнительные поля, которые frontend использует opportunistically, если backend уже отдаёт их в task payload:

- `channel` / `sourceChannel`
- `externalNumber`
- `externalId`

SLA блок в task summary/detail:

- `sla.policy`
- `sla.firstResponseDueAt`
- `sla.resolutionDueAt`
- `sla.firstResponseAt`
- `sla.resolvedAt`
- `sla.firstResponseStatus`
- `sla.resolutionStatus`

Backend временно принимает legacy aliases: `serviceDeskFolderId`, `ticketTypeId`, `ticketSubtypeId`.

Основные query-параметры inbox:

- `limit` (`1..100`, по умолчанию `25`) и `offset`;
- `search` или legacy `title` - тема, описание, заявщик, номер заявки и Freshdesk reference;
- `status`, `priority`, `folderId`, `typeId`, `subtypeId`, `entityId`, `assigneeId`;
- `channel=WEB|EMAIL`, `scope=mine`, `updatedAfter`;
- `sortBy=updated|created|number`, `sortOrder=asc|desc`.

### Email thread по заявке

`GET /tasks/:id/email-thread` возвращает `taskId` и `messages[]` с направлением `INBOUND/OUTBOUND`, темой, отправителем/получателем, preview и датами.

Visibility:

- `ADMIN` и `AGENT` получают технические поля исходящих сообщений (`status`, `attempts`, `errorMessage`, `nextRetryAt`).
- `REQUESTER` и `VIEWER` получают безопасную историю без технических деталей retry/error.

### Email health (admin)

`GET /servicedesk/admin/email-health` возвращает диагностические метрики email-контура (без секретов), например:

- outbound включён/выключен;
- worker включён/выключен;
- интервал worker;
- batch size;
- max attempts;
- retryable/locked counts;
- oldest pending/failed;
- masked smtp/from/user значения, если доступны.

### Notifications

- `GET /notifications?unreadOnly=&limit=&cursor=`
- `GET /notifications/unread-count`
- `PATCH /notifications/:id/read`
- `PATCH /notifications/read-all`

Frontend поддерживает оба list response shape:

- `Notification[]`
- `{ items: Notification[], nextCursor?: string | null }`

Backend покрывает уведомления о:

- новой заявке;
- ответе заявителя;
- публичном комментарии исполнителя;
- внутренней заметке для исполнителей;
- назначении исполнителя;
- смене статуса;
- merge;
- важных email outbox ошибках.

Email-уведомления идут через существующий outbox и включаются через `EMAIL_NOTIFICATIONS_ENABLED=true`.

### Freshdesk import

Рекомендуемый путь переноса использует Freshdesk API v2 с backend-only API key:

```bash
npm --workspace task-manager-backend run import:freshdesk:api -- --dry-run --max-tickets 20
```

Для совместимости сохранён файловый JSON/CSV import:

```bash
npm --workspace task-manager-backend run import:freshdesk -- --file /absolute/path/to/export.json --dry-run
```

Поддерживаются dry-run, идемпотентный повтор, исходные номера/даты, все conversations, пользователи, папки по Freshdesk group и опциональная загрузка бинарных вложений.

Admin API прямого переноса:

- `GET /servicedesk/admin/freshdesk-import/source-health`
- `POST /servicedesk/admin/freshdesk-import/pull/dry-run`
- `POST /servicedesk/admin/freshdesk-import/pull`

Admin API принимает JSON body в формате массива заявок или `{ "tickets": [...], "fileName": "freshdesk-export.json" }`:

- `POST /servicedesk/admin/freshdesk-import/dry-run`
- `POST /servicedesk/admin/freshdesk-import`
- `GET /servicedesk/admin/freshdesk-import/runs?limit=&cursor=`
- `GET /servicedesk/admin/freshdesk-import/runs/:id`

Прямой API-import может безопасно скачать вложения при включённом `FRESHDESK_DOWNLOAD_ATTACHMENTS_ENABLED`. Файловый JSON/CSV import намеренно остаётся metadata-only и не скачивает произвольные URL.

Frontend `/admin` -> `Импорт Freshdesk` предлагает прямой мастер переноса с обязательным dry-run и резервный файловый режим. API key хранится только в backend env и не передаётся браузеру.

### Automation on create

Backend-first automation v1 запускается только после создания заявки:

- `TASK_CREATED` - обычный `POST /tasks`, канал `WEB`.
- `EMAIL_TICKET_CREATED` - email intake pipeline, канал `EMAIL`.

Правила выполняются:

- только для `isActive=true`;
- только для своего `triggerType`;
- по `sortOrder ASC`;
- последовательно по уже обновлённому состоянию заявки;
- без запуска на `PUT /tasks/:id` и `PATCH /tasks/:id/status`.

Поддержанные conditions:

- `channel`: `WEB | EMAIL`
- `folderId`
- `entityId`
- `typeId`
- `subtypeId`
- `priority`
- `requesterEmailContains`
- `titleContains`

Поддержанные actions:

- `setFolderId`
- `setEntityId`
- `setTypeId`
- `setSubtypeId`
- `setPriority`
- `setAssigneeIds`

Dry-run и execution log описаны в `docs/AUTOMATION_RULES.md`.

## Merge и согласованное закрытие

- `POST /tasks/:id/merge` - связать или объединить заявки.
- `GET /tasks/:id/merge-info` - получить связи и состояние закрытия.
- `POST /tasks/:id/close-approve` - исполнитель подтверждает закрытие.

Payload merge:

```json
{
  "mergeMode": "UNION",
  "childTaskIds": ["childTaskId"],
  "reason": "Дублирующая заявка"
}
```

## SLA admin API

- `GET /servicedesk/admin/sla-policies`
- `GET /servicedesk/admin/sla-policies/:id`
- `POST /servicedesk/admin/sla-policies`
- `PUT /servicedesk/admin/sla-policies/:id`
- `DELETE /servicedesk/admin/sla-policies/:id`
- `POST /servicedesk/admin/sla-policies/:id/test`

Create/update payload shape:

```json
{
  "name": "High priority IT",
  "description": "Fast lane for critical IT incidents",
  "isActive": true,
  "sortOrder": 10,
  "folderId": "folder_id",
  "typeId": "type_id",
  "subtypeId": "subtype_id",
  "priority": "HIGH",
  "firstResponseMinutes": 30,
  "resolutionMinutes": 120
}
```

SLA `test` payload:

```json
{
  "taskId": "task_id"
}
```

Frontend usage note:

- `/admin` использует отдельную вкладку `SLA`.
- UI читает policies списком, затем подгружает детальную карточку выбранной policy через `GET /:id`.
- Dry-run SLA запускается только вручную из админки и не меняет заявку.
- В `TaskCard` SLA показывается компактно, а в `TaskDetailsModal` раскрывается в полный блок со сроками и статусами.

Подробности по логике: `docs/SLA.md`.

## Comments and files

- `GET /comments/:taskId`
- `POST /comments/:taskId`
- `PUT /comments/:id`
- `DELETE /comments/:id`
- `POST /files/:taskId`
- `GET /files/:taskId`
- `GET /files/:id/download`
- `DELETE /files/:id`

Comment payload now supports `visibility`:

- `PUBLIC`
- `INTERNAL`

Create payload example:

```json
{
  "content": "Внутренняя заметка исполнителя",
  "visibility": "INTERNAL"
}
```

If `visibility` is omitted, backend uses `PUBLIC`.

Visibility rules:

- `ADMIN`, `AGENT` read `PUBLIC` + `INTERNAL`
- `REQUESTER`, `VIEWER` read only `PUBLIC`
- `REQUESTER` creates only `PUBLIC`
- `VIEWER` does not create comments

Task detail also returns `comments[].visibility`.

## Notifications

Фронтенд центр уведомлений рассчитан на следующие endpoints:

- `GET /notifications`
- `GET /notifications/unread-count`
- `PATCH /notifications/:id/read`
- `PATCH /notifications/read-all`

Если `unread-count` или `read-all` ещё не внедрены, frontend уходит в fallback:

- unread считается локально по `GET /notifications`;
- `Отметить всё прочитанным` выполняется батчем через `PATCH /notifications/:id/read`.

Frontend usage:

- `TaskDetailsModal` sends `visibility` explicitly on create.
- `ADMIN` and `AGENT` can choose between public comment and internal note.
- `REQUESTER` always sends `PUBLIC`.
- `VIEWER` has no comment form in UI.

Details: `docs/COMMENTS_AND_NOTES.md`.

## Canned replies

- `GET /canned-replies`
- `GET /canned-replies/:id`
- `POST /canned-replies`
- `PUT /canned-replies/:id`
- `DELETE /canned-replies/:id`
- `POST /tasks/:id/reply-from-template`

Visibility model:

- `PRIVATE` - доступен только автору шаблона
- `SHARED` - доступен всем `ADMIN` и `AGENT`

Только `ADMIN` и `AGENT` работают с шаблонами. `REQUESTER` и `VIEWER` не читают и не управляют этим API.

List filters:

- `search`
- `category`
- `visibility`
- `authorId`
- `isActive`

Поиск работает по `title`, `body`, `category`.

Create payload example:

```json
{
  "title": "Первичный ответ",
  "body": "Здравствуйте!\n\nЗаявка принята в работу.",
  "category": "General",
  "visibility": "SHARED",
  "isActive": true
}
```

Apply payload example:

```json
{
  "templateId": "template_id",
  "mode": "EMAIL_REPLY",
  "bodyOverride": "Индивидуальный текст поверх шаблона"
}
```

Apply behavior:

- `COMMENT` - создаёт `PUBLIC` комментарий в заявке
- `EMAIL_REPLY` - использует текущий `email-reply` flow и возвращает `dryRun=true`, если SMTP отключён

Frontend usage:

- отдельный раздел `/canned-replies` доступен `ADMIN` и `AGENT`;
- `TaskDetailsModal` позволяет:
  - выбрать активный шаблон;
  - отредактировать текст через `bodyOverride`;
  - применить как публичный комментарий;
  - применить как email-ответ.
- После успешного применения UI перезагружает task detail и список комментариев, чтобы сразу отразить `PUBLIC` comment и SLA first response.

Подробности: `docs/CANNED_REPLIES.md`.

## Timeline заявки

- `GET /tasks/:id/timeline`

Timeline возвращает продуктовую историю действий по заявке:

- создание заявки
- смена статуса
- публичные комментарии
- внутренние заметки
- назначения исполнителей
- применение canned replies
- email replies
- merge и close approval

Права:

- используются те же права, что и у `GET /tasks/:id`
- `REQUESTER` не видит `INTERNAL_NOTE_ADDED`
- `REQUESTER` и `VIEWER` получают только безопасную metadata
- `ADMIN` и `AGENT` видят полную историю доступной им заявки

Response shape:

```json
{
  "id": "event_id",
  "taskId": "task_id",
  "type": "STATUS_CHANGED",
  "title": "Статус изменён",
  "description": "NEW -> IN_PROGRESS",
  "metadata": {
    "fromStatus": "NEW",
    "toStatus": "IN_PROGRESS"
  },
  "actor": {
    "id": "user_id",
    "name": "Иван Петров",
    "email": "ivan@example.com",
    "role": "AGENT"
  },
  "createdAt": "2026-04-28T10:00:00.000Z"
}
```

Подробности: `docs/TASK_TIMELINE.md`.

Frontend usage:

- `TaskDetailsModal` читает timeline через `GET /tasks/:id/timeline`.
- UI показывает русские подписи для типов событий и не выводит raw JSON metadata.
- После комментариев, internal notes, canned replies, смены статуса, merge и close approval фронт обновляет timeline вместе с task detail и комментариями.

## Email intake

HTTP API для email intake сейчас нет. Backend поддерживает:

- `npm --workspace task-manager-backend run email:smoke`
- `npm --workspace task-manager-backend run email:sync`
- scheduler при `EMAIL_INTAKE_ENABLED=true`

Письмо создаёт заявку от пользователя, привязанного к email. Если пользователя нет, создаётся внешний `REQUESTER`, которого администратор может позже отредактировать.

Email intake теперь поддерживает automation trigger `EMAIL_TICKET_CREATED`.

## Automation admin API

- `GET /servicedesk/admin/automation-rules`
- `GET /servicedesk/admin/automation-rules/:id`
- `POST /servicedesk/admin/automation-rules`
- `PUT /servicedesk/admin/automation-rules/:id`
- `DELETE /servicedesk/admin/automation-rules/:id`
- `GET /servicedesk/admin/automation-runs?taskId=&ruleId=`
- `POST /servicedesk/admin/automation-rules/:id/test`

Frontend usage note:

- `/admin` использует отдельную вкладку `Автоматизация`.
- UI читает правила списком, затем подгружает детальную карточку выбранного правила через `GET /:id`.
- Dry-run запускается только вручную из админки и не меняет заявку.
- Если `ruleId` в фильтре runs пустой, UI по умолчанию показывает запуски выбранного правила.

Create/update payload shape:

```json
{
  "name": "VPN dispatch",
  "description": "Route VPN tickets into IT queue",
  "isActive": true,
  "sortOrder": 10,
  "triggerType": "TASK_CREATED",
  "conditions": {
    "channel": "WEB",
    "titleContains": "vpn"
  },
  "actions": {
    "setFolderId": "folder_id",
    "setEntityId": "entity_id",
    "setTypeId": "type_id",
    "setSubtypeId": "subtype_id",
    "setPriority": "HIGH",
    "setAssigneeIds": ["user_id_1", "user_id_2"]
  }
}
```

Dry-run payload:

```json
{
  "taskId": "task_id"
}
```

## Email reply

- `POST /tasks/:id/email-reply` - создать публичный комментарий и отправить/dry-run email-ответ заявителю.
- `GET /tasks/:id/email-thread` - прочитать связанную email-историю заявки.

Payload:

```json
{
  "message": "Текст ответа"
}
```

При `EMAIL_OUTBOUND_ENABLED=false` реальные письма не отправляются, но создаётся outbox-запись со статусом `DRY_RUN`, а ответ возвращает `dryRun=true`.

Теперь outbound email работает через persistent outbox `email_outbound_messages`:

- `DRY_RUN` - отправка отключена, письмо не уходит в SMTP.
- `SENT` - успешно отправлено.
- `RETRY_PENDING` / `FAILED` - отправка неуспешна, запись видна для ретрая.
- `bodyText` хранит полный текст письма для retry (без обрезки до preview).

Admin outbox API:

- `GET /servicedesk/admin/email-outbox?status=&taskId=`
- `POST /servicedesk/admin/email-outbox/:id/retry`

Ограничение выборки outbox:

- default `limit=50`;
- max `limit=100`;
- невалидный или отрицательный `limit` приводит к default.

## Knowledge base

- `GET /knowledge/articles` - список статей с фильтрами `search`, `category`, `isPublished`.
- `GET /knowledge/articles/:id` - статья по `id` или `slug`.
- `POST /knowledge/articles` - создать статью, роли `ADMIN`, `AGENT`.
- `PUT /knowledge/articles/:id` - обновить статью, роли `ADMIN`, `AGENT`.
- `DELETE /knowledge/articles/:id` - удалить статью, роли `ADMIN`, `AGENT`.

## Folder/team permissions summary

- `GET /servicedesk/folders` для `AGENT` возвращает только папки его команд.
- `GET /servicedesk/types` и `GET /servicedesk/subtypes` для `AGENT` ограничены этими же папками.
- `GET /servicedesk/admin/teams` возвращает для команды `folderIds`, `folders`, `members`.

## Dashboard и reports

- `GET /dashboard` - доступно авторизованным пользователям, данные фильтруются по роли.
- `GET /reports` - только `ADMIN` и `VIEWER`; ServiceDesk-статистика по заявкам, папкам, SLA и активности комментариев.

`AGENT` получает `403`, потому что endpoint отдаёт общую статистику по сотрудникам и папкам. Scoped reports для исполнителей пока не реализованы. `GET /reports` больше не читает финансовые таблицы и не возвращает метрики расходов. Активный продукт - ServiceDesk.

## Legacy API, отключённый из runtime

Следующие endpoints старого task-manager/finance контура не подключены в `src/app.js`:

- `/accounts`
- `/transactions`
- `/reviews`

Исторические Prisma-модели `Account`, `Transaction`, `TaskReview` и старые миграции не удаляются, чтобы не рисковать существующими данными и rollback-сценариями. Новые интеграции не должны использовать эти endpoints.

## Departments compatibility

- `GET /departments` - compatibility endpoint для старых профилей и membership-сценариев.
- `GET /departments/admin`, `POST /departments`, `PATCH /departments/:id`, `DELETE /departments/:id` - admin compatibility API.

Для новых ServiceDesk очередей canonical API - `/servicedesk/folders`, `/servicedesk/teams` и folder/team permissions. `Department` не является целевой моделью маршрутизации заявок.
