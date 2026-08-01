# SLA

Актуально на 2026-04-27.

## Что реализовано

Backend-first SLA foundation для внутренних заявок ServiceDesk:

- справочник `SLA policy`;
- выбор policy по `sortOrder ASC`;
- автопривязка policy к заявке;
- расчёт `first response` и `resolution` дедлайнов;
- live-статусы `PENDING | MET | BREACHED` без отдельного scheduler;
- first response от `ADMIN`/`AGENT` по комментарию или `email-reply`;
- `resolvedAt` при закрытии и сброс при reopen админом.

## Поля SLA policy

- `name`
- `description`
- `isActive`
- `sortOrder`
- `folderId`
- `typeId`
- `subtypeId`
- `priority`
- `firstResponseMinutes`
- `resolutionMinutes`

`null` в `folderId/typeId/subtypeId/priority` означает wildcard: поле не ограничивает матчинг.

## Как выбирается policy

1. Берутся только `isActive=true`.
2. Сортировка: `sortOrder ASC`, затем `createdAt ASC`.
3. Первая policy, которая матчится по AND, применяется к заявке.

Матчинг:

- `folderId`
- `typeId`
- `subtypeId`
- `priority`

Если подходящей policy нет, у заявки:

- `sla.policy = null`
- `firstResponseDueAt = null`
- `resolutionDueAt = null`
- SLA status для соответствующего таймера тоже `null`

## Когда считается SLA

### При создании заявки

- backend подбирает policy;
- пишет `slaPolicyId`;
- рассчитывает `firstResponseDueAt` и `resolutionDueAt` от `createdAt`.

### При update классификации

Если меняются `folderId`, `typeId`, `subtypeId` или `priority`, backend пересчитывает SLA policy и due dates по тем же правилам, сохраняя уже наступившие факты `firstResponseAt`/`resolvedAt`.

### При first response

`firstResponseAt` ставится только когда первый ответ даёт `ADMIN` или `AGENT`:

- `POST /api/comments/:taskId`
- `POST /api/tasks/:id/email-reply`

Комментарий от `REQUESTER` не засчитывается.

### При закрытии и reopen

- при переводе в `DONE` ставится `resolvedAt`;
- при reopen из `DONE` админом `resolvedAt` сбрасывается;
- `resolutionStatus` снова считается от текущего времени и старого `resolutionDueAt`.

## Как считаются статусы

Для каждого таймера:

- если due date нет -> статус `null`;
- если факт уже есть и он раньше/в срок -> `MET`;
- если факт уже есть и он позже дедлайна -> `BREACHED`;
- если факта нет и дедлайн ещё не наступил -> `PENDING`;
- если факта нет и дедлайн уже прошёл -> `BREACHED`.

Важно: отдельного cron/scheduler пока нет. Статус считается live на чтении и обновлениях.

## Admin API

- `GET /api/servicedesk/admin/sla-policies`
- `GET /api/servicedesk/admin/sla-policies/:id`
- `POST /api/servicedesk/admin/sla-policies`
- `PUT /api/servicedesk/admin/sla-policies/:id`
- `DELETE /api/servicedesk/admin/sla-policies/:id`
- `POST /api/servicedesk/admin/sla-policies/:id/test`

Пример `test`:

```json
{
  "taskId": "task_id"
}
```

Ответ:

- `matched`
- `policy`
- `resultingDueDates`
- `resultingStatuses`

## Что возвращает task API

В summary/detail у заявки теперь есть блок `sla`:

```json
{
  "sla": {
    "policy": {
      "id": "sla_policy_id",
      "name": "High priority IT",
      "sortOrder": 10
    },
    "firstResponseDueAt": "2026-04-27T09:30:00.000Z",
    "resolutionDueAt": "2026-04-27T11:00:00.000Z",
    "firstResponseAt": "2026-04-27T09:10:00.000Z",
    "resolvedAt": null,
    "firstResponseStatus": "MET",
    "resolutionStatus": "PENDING"
  }
}
```

## Ограничения текущей фазы

- Нет UI для управления SLA.
- Нет business hours и рабочих календарей.
- Нет escalation, reminder, cron и push-уведомлений по breach.
- Нет SLA-отчётности.
- Нет массового перерасчёта исторических заявок при изменении policy.
