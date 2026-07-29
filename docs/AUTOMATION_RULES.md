# Automation Rules

Актуально на 2026-04-26.

## Scope v1

Первая production-основа automation rules сделана backend-first и без UI. Цель релиза - дать надёжный dispatch/business-rules foundation в стиле Freshdesk, но без overly generic engine.

Что входит в v1:

- admin CRUD для automation rules;
- dry-run одного правила по `taskId`;
- execution log по реально сработавшим правилам;
- запуск только после создания заявки;
- отдельный trigger для email intake.

Что не входит в v1:

- frontend UI;
- status/update-based triggers;
- SLA / escalations;
- сложные nested groups `AND/OR`;
- time-based automation;
- очистка `folder/entity/type/subtype` через actions.

## Triggers

- `TASK_CREATED`
  Используется после обычного `POST /api/tasks`.
  Runtime channel для conditions: `WEB`.

- `EMAIL_TICKET_CREATED`
  Используется после email intake создания заявки.
  Runtime channel для conditions: `EMAIL`.

## Rule schema

В БД rule хранится в таблице `automation_rules` explicit columns, а наружу API отдаёт её как:

```json
{
  "id": "rule_id",
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
    "setAssigneeIds": ["user_1", "user_2"]
  },
  "createdAt": "2026-04-26T16:00:00.000Z",
  "updatedAt": "2026-04-26T16:00:00.000Z"
}
```

## Supported conditions

- `channel`: `WEB | EMAIL`
- `folderId`
- `entityId`
- `typeId`
- `subtypeId`
- `priority`: `LOW | MEDIUM | HIGH | URGENT`
- `requesterEmailContains`
- `titleContains`

Все conditions работают как `AND`.

## Supported actions

- `setFolderId`
- `setEntityId`
- `setTypeId`
- `setSubtypeId`
- `setPriority`
- `setAssigneeIds`

Примечания:

- `setAssigneeIds: []` допустим и означает очистку списка исполнителей.
- `setAssigneeIds: null` при update rules снимает само action.
- Actions не умеют очищать `folder/entity/type/subtype`; в v1 они только выставляют значения.

## Execution semantics

- Движок выбирает только `isActive=true` rules нужного `triggerType`.
- Порядок выполнения: `sortOrder ASC`, затем `createdAt ASC`.
- Следующее правило видит уже обновлённое состояние заявки.
- Рекурсивного запуска нет: automation не вызывается из task update/status flow.
- Валидность связей `folder/entity/type/subtype` проверяется той же backend-логикой, что и в task create/update.

Если rule matched, но её actions не меняют состояние:

- rule всё равно считается сработавшей;
- в log пишется `SUCCESS`;
- `appliedActions` будет пустым объектом.

Если rule matched, но actions невалидны для текущей заявки:

- сама заявка не откатывается и не падает;
- rule пишет `ERROR` в execution log;
- следующие rules продолжают выполняться уже от прежнего состояния заявки.

## Execution log

Лог хранится в `automation_runs`.

Response shape:

```json
{
  "id": "run_id",
  "ruleId": "rule_id",
  "ruleName": "VPN dispatch",
  "taskId": "task_id",
  "triggerType": "TASK_CREATED",
  "status": "SUCCESS",
  "success": true,
  "appliedActions": {
    "setPriority": "HIGH",
    "setAssigneeIds": ["user_1", "user_2"]
  },
  "errorMessage": null,
  "createdAt": "2026-04-26T16:10:00.000Z"
}
```

## Admin API

- `GET /api/servicedesk/admin/automation-rules`
- `GET /api/servicedesk/admin/automation-rules/:id`
- `POST /api/servicedesk/admin/automation-rules`
- `PUT /api/servicedesk/admin/automation-rules/:id`
- `DELETE /api/servicedesk/admin/automation-rules/:id`
- `GET /api/servicedesk/admin/automation-runs?taskId=&ruleId=`
- `POST /api/servicedesk/admin/automation-rules/:id/test`

Dry-run request:

```json
{
  "taskId": "task_id"
}
```

Dry-run response:

```json
{
  "dryRun": true,
  "ruleId": "rule_id",
  "taskId": "task_id",
  "matched": true,
  "success": true,
  "appliedActions": {
    "setFolderId": "folder_id",
    "setPriority": "HIGH"
  },
  "errorMessage": null,
  "resultingTask": {
    "id": "task_id",
    "title": "VPN access request",
    "priority": "HIGH",
    "folderId": "folder_id",
    "entityId": "entity_id",
    "typeId": "type_id",
    "subtypeId": "subtype_id",
    "assigneeIds": ["user_1", "user_2"]
  }
}
```

## Delete safety

Удаление `folder`, `entity`, `type`, `subtype` теперь блокируется, если на них ссылается хотя бы одна automation rule. Это сделано отдельно от UI, чтобы не оставлять “висячие” правила в production.
