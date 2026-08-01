# Product Timeline заявки

`TaskTimelineEvent` — это продуктовая история действий по заявке, отдельная от технического audit middleware.

## Зачем

Timeline нужен, чтобы в карточке заявки можно было показать понятную историю:

- кто создал заявку
- кто поменял статус
- кто оставил комментарий
- кто добавил внутреннюю заметку
- кто назначил исполнителя
- какой шаблон ответа использовали
- был ли email reply
- была ли заявка объединена

Это именно helpdesk-слой, а не универсальный технический аудит.

## Модель

Минимальные поля:

- `id`
- `taskId`
- `actorId`
- `type`
- `title`
- `description`
- `metadata`
- `createdAt`

## Типы событий v1

- `TASK_CREATED`
- `TASK_UPDATED`
- `STATUS_CHANGED`
- `ASSIGNEE_ADDED`
- `ASSIGNEE_REMOVED`
- `COMMENT_ADDED`
- `INTERNAL_NOTE_ADDED`
- `FILE_ATTACHED`
- `FILE_DELETED`
- `TASK_MERGED`
- `CLOSE_APPROVED`
- `CANNED_REPLY_USED`
- `EMAIL_REPLY_SENT`
- `SLA_POLICY_APPLIED`
- `AUTOMATION_APPLIED`

## Где создаются события

События пишутся в сервисах, где реально происходит бизнес-действие:

- `task.service.js`
- `comment.service.js`
- `canned-reply.service.js`
- `email-outbound.service.js`
- file upload/delete flow
- automation service

## Права

Timeline читается через:

- `GET /api/tasks/:id/timeline`

Права доступа такие же, как у самой заявки.

### Кто что видит

- `ADMIN` и `AGENT`
  - видят полную историю доступной им заявки
- `REQUESTER`
  - не видит `INTERNAL_NOTE_ADDED`
  - не получает внутреннюю metadata
- `VIEWER`
  - read-only
  - тоже не видит `INTERNAL_NOTE_ADDED`

## Metadata

Примеры полезной metadata:

- `STATUS_CHANGED`
  - `{ fromStatus, toStatus }`
- `ASSIGNEE_ADDED`
  - `{ assigneeId, assigneeName }`
- `ASSIGNEE_REMOVED`
  - `{ assigneeId, assigneeName }`
- `COMMENT_ADDED`
  - `{ commentId, visibility: "PUBLIC" }`
- `INTERNAL_NOTE_ADDED`
  - `{ commentId, visibility: "INTERNAL" }`
- `CANNED_REPLY_USED`
  - `{ templateId, templateTitle, mode }`
- `EMAIL_REPLY_SENT`
  - `{ recipient, dryRun, subject }`
- `TASK_MERGED`
  - `{ masterTaskId, childTaskIds, mergeMode, reason }`
- `CLOSE_APPROVED`
  - `{ approvedByUserId }`

Backend специально не сохраняет:

- пароли
- токены
- SMTP/IMAP секреты
- raw email body
- приватные env значения

## Поведение при ошибках

Если timeline event не записался, основное действие в большинстве сценариев не должно ломаться. Для этого используется безопасный helper записи.

Только там, где запись легко и естественно ложится в уже существующую транзакцию, timeline создаётся рядом с основным действием.
