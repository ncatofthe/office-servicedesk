# Notification Center

Актуально на 2026-06-03.

## Endpoint

- `GET /api/notifications?unreadOnly=&limit=&cursor=`
- `GET /api/notifications/unread-count`
- `PATCH /api/notifications/:id/read`
- `PATCH /api/notifications/read-all`

## Что уведомляется

- новая заявка в доступной папке;
- ответ заявителя;
- публичный комментарий исполнителя;
- внутренняя заметка для исполнителей;
- назначение исполнителя;
- смена статуса;
- merge;
- важные ошибки email outbox.

## Основные правила

- уведомления персональные: пользователь видит только свои записи;
- dedupe делается через `eventKey`;
- metadata хранится в безопасном виде;
- внутренняя заметка не отправляется заявителю;
- email-уведомления идут через существующий outbox, а не напрямую через SMTP.

## Env

- `EMAIL_NOTIFICATIONS_ENABLED`
- `PORTAL_BASE_URL`

## Ручная проверка

1. Создать заявку в папке с агентской командой.
2. Проверить unread count агента.
3. Оставить публичный ответ исполнителя и проверить уведомление заявителя.
4. Оставить `INTERNAL` note и проверить, что заявитель новое уведомление не получил.
5. Вызвать `PATCH /api/notifications/read-all`.
