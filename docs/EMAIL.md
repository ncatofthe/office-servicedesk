# Email pipeline (ServiceDesk)

Актуально на 2026-07-18.

## Цель

Email-контур построен так, чтобы:

- входящие письма не создавали дубли заявок;
- исходящие ответы не терялись даже при ошибке SMTP;
- сохранялся threading (`Re:`, `In-Reply-To`, `References`);
- была прозрачная диагностика для `ADMIN`/`AGENT`.

## Inbound (email intake)

Основной сервис: `task-manager-backend/src/services/email-intake.service.js`.

Дедупликация и атомарность:

- уникальный `messageId` (`EmailInboundMessage.messageId @unique`);
- уникальная пара `mailbox + uid` (`@@unique([mailbox, uid])`);
- inbound-маркер создаётся первым внутри одной транзакции PostgreSQL;
- пользователь, заявка, timeline, записи вложений и связь inbound с заявкой создаются в той же транзакции;
- конкурентный обработчик блокируется уникальным индексом, после `P2002` находит уже созданную заявку и не оставляет собственную;
- файлы вложений готовятся до короткой DB-транзакции и удаляются при rollback/ошибке;
- старые незарегистрированные файлы `email-*` очищаются перед IMAP sync после безопасного часового окна.

IMAP-соединение и парсинг письма не входят в DB-транзакцию. Автоматизация и уведомления запускаются после успешного commit, сохраняя прежний product flow.

Итог: повторный или конкурентный intake того же письма не создаёт дубль заявки и не оставляет файлы проигравшего обработчика.

DB-тесты используют отдельный `UPLOADS_DIR=./uploads-test`, чтобы rollback/orphan-проверки никогда не работали с dev или production uploads.

### Yandex readiness check

Безопасная диагностика env:

```bash
npm --workspace task-manager-backend run email:yandex:check
```

Скрипт:

- показывает `EMAIL_INTAKE_ENABLED`, `EMAIL_OUTBOUND_ENABLED`, `EMAIL_NOTIFICATIONS_ENABLED`;
- проверяет наличие IMAP/SMTP host/port/user/password/from;
- маскирует email/login и никогда не печатает пароли;
- не отправляет реальные письма.

Опциональные сетевые проверки без отправки письма:

```bash
npm --workspace task-manager-backend run email:yandex:check -- --connect-imap --verify-smtp
```

`--connect-imap` логинится в IMAP и открывает mailbox. `--verify-smtp` делает SMTP handshake/login через `nodemailer.verify()`, но не вызывает `sendMail`.

Рекомендуемый Yandex contract:

- `EMAIL_IMAP_HOST=imap.yandex.ru`
- `EMAIL_IMAP_PORT=993`
- `EMAIL_IMAP_SECURE=true`
- `EMAIL_SMTP_HOST=smtp.yandex.ru`
- `EMAIL_SMTP_PORT=465`
- `EMAIL_SMTP_SECURE=true`
- `EMAIL_IMAP_USER`, `EMAIL_IMAP_PASSWORD`
- `EMAIL_SMTP_USER`, `EMAIL_SMTP_PASSWORD`
- `EMAIL_FROM_ADDRESS`

## Outbound (email reply/outbox)

Основной сервис: `task-manager-backend/src/services/email-outbound.service.js`.

Новая таблица: `email_outbound_messages`.

Статусы:

- `DRY_RUN`
- `SENT`
- `FAILED`
- `RETRY_PENDING`

Каждый вызов:

- `POST /api/tasks/:id/email-reply`
- `POST /api/tasks/:id/reply-from-template` (`mode=EMAIL_REPLY`)

создаёт:

1. публичный комментарий в задаче;
2. запись outbox.

Если SMTP выключен (`EMAIL_OUTBOUND_ENABLED=false`):

- реальное письмо не отправляется;
- outbox получает `DRY_RUN`.

Если SMTP включен:

- успех -> `SENT` + `messageId/providerMessageId`;
- ошибка -> комментарий остаётся, outbox уходит в `RETRY_PENDING`, ошибка фиксируется в `errorMessage`.

Полезные поля outbox:

- `bodyText` - полный текст письма для надёжного retry;
- `textPreview` - укороченный preview для быстрых списков;
- `inReplyTo`/`references` - threading headers.

## Retry foundation

Команда:

```bash
npm --workspace task-manager-backend run email:outbox:retry
```

Скрипт обрабатывает outbox-записи в `FAILED`/`RETRY_PENDING`, у которых подошло время retry.
`SENT` и `DRY_RUN` не переотправляются.

При `EMAIL_OUTBOUND_ENABLED=false` retry не отправляет реальных писем и переводит запись в `DRY_RUN`.
При retry отправляется `bodyText`; fallback на `textPreview` используется только для legacy-записей без `bodyText`.

### Lock и конкурентная безопасность

Outbox retry использует lock/claim-механику на уровне БД:

- поля `lockedAt` и `lockedBy` в `email_outbound_messages`;
- claim выполняется атомарно через `updateMany` с проверкой статуса, `attempts`, `nextRetryAt` и lock TTL;
- если запись уже захвачена другим процессом, повторный retry получает skip (`LOCKED_OR_NOT_DUE`).

Это защищает от двойной отправки при параллельных запусках (например, worker + ручной retry).

### Retry policy

- `SENT` и `DRY_RUN` не переотправляются;
- `FAILED` и `RETRY_PENDING` участвуют в retry;
- при `attempts >= EMAIL_OUTBOX_MAX_ATTEMPTS` запись больше не ретраится;
- временная ошибка оставляет `RETRY_PENDING` и ставит `nextRetryAt`;
- финальная ошибка (достигнут максимум попыток) фиксируется как `FAILED`.

### Worker (автоматический retry)

Новый worker выключен по умолчанию и запускается только при `EMAIL_OUTBOX_WORKER_ENABLED=true`.

Причина выключенного default: не ломать dev/test/e2e контур и не запускать фоновую отправку без явного ops-решения.

Env:

- `EMAIL_OUTBOX_WORKER_ENABLED=false`
- `EMAIL_OUTBOX_WORKER_INTERVAL_MS=60000`
- `EMAIL_OUTBOX_WORKER_BATCH_SIZE=20`
- `EMAIL_OUTBOX_LOCK_TTL_MS=300000`
- `EMAIL_OUTBOX_MAX_ATTEMPTS=5`

Worker стартует вместе с backend и использует ту же retry-реализацию, что:

- `POST /api/servicedesk/admin/email-outbox/:id/retry`
- `npm --workspace task-manager-backend run email:outbox:retry`

## Threading

Для ответа используются:

- получатель из последнего inbound (`fromEmail`);
- subject с префиксом `Re:`;
- `In-Reply-To` и `References` из inbound `messageId` и последнего outbound `messageId` (если есть).

## API

Пользовательская история email по заявке:

- `GET /api/tasks/:id/email-thread`

Админский outbox:

- `GET /api/servicedesk/admin/email-outbox?status=&taskId=`
- `POST /api/servicedesk/admin/email-outbox/:id/retry`
- `GET /api/servicedesk/admin/email-health`

`GET /api/servicedesk/admin/email-outbox` поддерживает безопасный clamp:

- default `limit=50`;
- максимум `limit=100`;
- невалидный/отрицательный `limit` -> fallback на default.

`GET /api/servicedesk/admin/email-health` возвращает безопасную диагностику:

- `outboundEnabled`, `workerEnabled`, интервалы и batch/TTL/max attempts;
- счётчики outbox по статусам;
- количество retryable и locked записей;
- oldest timestamp для pending/failed;
- SMTP конфиг без секретов (`hostMasked`/`port`/`secure` + masked `user`/`from`).

## Видимость и безопасность

- Доступ к `GET /tasks/:id/email-thread` проверяется теми же правами, что и чтение задачи.
- `REQUESTER` не видит внутренние SMTP-детали (`errorMessage`, retry fields, delivery status).
- `ADMIN`/`AGENT` видят полный delivery-статус.
- Секреты SMTP/IMAP, пароли и токены не сохраняются в outbox/timeline.

## Быстрая ручная проверка перед staging

1. Заполнить `.env` Yandex IMAP/SMTP значениями.
2. Выполнить `npm --workspace task-manager-backend run email:yandex:check`.
3. Выполнить `npm --workspace task-manager-backend run email:yandex:check -- --connect-imap --verify-smtp`.
4. Оставить `EMAIL_OUTBOUND_ENABLED=false` и выполнить `npm --workspace task-manager-backend run email:reply-smoke`.
5. Включать `EMAIL_OUTBOUND_ENABLED=true` только после успешной проверки mailbox, SMTP login и адреса отправителя.
