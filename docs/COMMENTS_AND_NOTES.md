# Comments and Internal Notes

Актуально на 2026-04-27.

## Что добавлено

У комментариев теперь есть `visibility`:

- `PUBLIC`
- `INTERNAL`

Все существующие старые комментарии считаются `PUBLIC`.

## Права на создание

- `ADMIN` может создавать `PUBLIC` и `INTERNAL`
- `AGENT` может создавать `PUBLIC` и `INTERNAL`
- `REQUESTER` может создавать только `PUBLIC`
- `VIEWER` не создаёт комментарии

Если поле `visibility` не передано, backend использует `PUBLIC`.

Для мягкой совместимости `POST /comments/:taskId` также принимает alias `type`, но canonical поле - `visibility`.

## Видимость

- `ADMIN` видит `PUBLIC` и `INTERNAL`
- `AGENT` видит `PUBLIC` и `INTERNAL`
- `REQUESTER` видит только `PUBLIC`
- `VIEWER` видит только `PUBLIC`

Это правило одинаково применяется:

- в `GET /comments/:taskId`
- в `GET /tasks/:id` внутри `comments`

## SLA

`INTERNAL` комментарий тоже считается first response, если это первый комментарий от `ADMIN` или `AGENT`.

## Email reply

`POST /tasks/:id/email-reply` остаётся публичным каналом:

- создаёт комментарий c `visibility=PUBLIC`
- не превращается во внутреннюю заметку

## Примеры

Публичный комментарий:

```json
{
  "content": "Проверяем проблему",
  "visibility": "PUBLIC"
}
```

Внутренняя заметка:

```json
{
  "content": "Подозрение на сбой на стороне VPN-концентратора.",
  "visibility": "INTERNAL"
}
```
