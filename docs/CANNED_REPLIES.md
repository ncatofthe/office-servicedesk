# Canned Replies

Backend foundation для canned replies / шаблонов ответов.

## Сущность

Поля:

- `id`
- `title`
- `body`
- `category`
- `isActive`
- `visibility`
- `authorId`
- `createdAt`
- `updatedAt`

`body` хранится как есть. На этой фазе backend не поддерживает переменные вида `{{ticket.id}}` и не использует templating engine.

## Visibility

- `PRIVATE`
  - видит только автор
  - использовать может только автор
- `SHARED`
  - видят и используют все `ADMIN` и `AGENT`

`REQUESTER` и `VIEWER` не работают с canned replies API.

## Права

- `ADMIN`
  - создаёт `PRIVATE` и `SHARED`
  - читает свои `PRIVATE` и все `SHARED`
  - редактирует и удаляет любой шаблон
- `AGENT`
  - создаёт `PRIVATE` и `SHARED`
  - читает свои `PRIVATE` и все `SHARED`
  - редактирует и удаляет только свои шаблоны

## API

- `GET /api/canned-replies`
- `GET /api/canned-replies/:id`
- `POST /api/canned-replies`
- `PUT /api/canned-replies/:id`
- `DELETE /api/canned-replies/:id`

Фильтры списка:

- `search`
- `category`
- `visibility`
- `authorId`
- `isActive`

Поиск идёт по:

- `title`
- `body`
- `category`

## Apply to task

Endpoint:

- `POST /api/tasks/:id/reply-from-template`

Payload:

```json
{
  "templateId": "template_id",
  "mode": "COMMENT",
  "bodyOverride": "Необязательная замена текста"
}
```

`mode`:

- `COMMENT`
  - создаёт `PUBLIC` комментарий
  - использует текущую comment visibility и SLA first response логику
- `EMAIL_REPLY`
  - использует существующий `email-reply` flow
  - работает через `EmailInboundMessage` threading
  - при `EMAIL_OUTBOUND_ENABLED=false` остаётся в `dry-run`

Для применения шаблона backend сначала проверяет текущий доступ к задаче через существующие task permissions.

## Future direction

Следующим шагом можно добавить:

- переменные и безопасный templating
- быстрые категории/папки для UI
- analytics по использованию шаблонов
- версионирование шаблонов
