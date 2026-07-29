# Staging checklist

Актуально на 2026-06-10.

Этот документ описывает короткий путь к первому staging-запуску Office ServiceDesk вместо Freshdesk. Цель стенда - проверить web-заявки, Yandex email и импорт Freshdesk на малом объёме данных.

Если нужен пошаговый launch pack "от сервера до UAT", см. [STAGING_LAUNCH_PACK.md](./STAGING_LAUNCH_PACK.md).

## 1. Подготовить PostgreSQL

Пример для локального сервера:

```bash
sudo -u postgres createuser servicedesk --pwprompt
sudo -u postgres createdb servicedesk_staging --owner servicedesk
```

Проверить подключение:

```bash
psql "postgresql://servicedesk:<password>@127.0.0.1:5432/servicedesk_staging?schema=public"
```

## 2. Подготовить backend env

Скопировать шаблон:

```bash
cp task-manager-backend/.env.production.example task-manager-backend/.env
```

Минимально обязательные значения:

- `DATABASE_URL` - PostgreSQL DSN staging-БД.
- `JWT_SECRET` - длинная случайная строка, не из примера.
- `PORT` - порт backend, обычно `5001`.
- `CORS_ORIGINS` - frontend origins через запятую. Для простого стенда можно заполнить `CORS_ORIGIN`, backend принимает его как alias.
- `PORTAL_BASE_URL` - публичный URL frontend, используется в ссылках email-уведомлений.
- `UPLOADS_DIR` - абсолютный путь к пользовательским файлам, например `/opt/officesd/uploads`.
- `BACKUP_DIR` - абсолютный путь к backup, например `/opt/officesd/backups`.

Для первого запуска оставить безопасные значения:

```env
EMAIL_INTAKE_ENABLED=false
EMAIL_OUTBOUND_ENABLED=false
EMAIL_NOTIFICATIONS_ENABLED=false
EMAIL_OUTBOX_WORKER_ENABLED=false
```

### CORS для домена и временного tunnel

Указывайте точный origin frontend без пути. Wildcard `*` backend намеренно не принимает:

```env
CORS_ORIGINS=https://servicedesk-staging.company.ru
```

Для временного Cloudflare Quick Tunnel нужно указать текущий случайный домен и перезапустить backend:

```env
CORS_ORIGINS=https://current-random-name.trycloudflare.com
PORTAL_BASE_URL=https://current-random-name.trycloudflare.com
```

Если одновременно доступны локальный и внешний frontend, перечислите оба значения через запятую. При создании нового Quick Tunnel его домен изменится, поэтому старый allowlist не должен пропускать новый домен автоматически. `CORS_ORIGINS` является deployment/security-настройкой и не редактируется из портала.

## 3. Применить миграции и создать первого ADMIN

Из корня проекта:

```bash
npm install
npm run build:contracts
npm --workspace task-manager-backend run prisma:migrate:deploy
```

Создать первого администратора:

```bash
BOOTSTRAP_ADMIN_EMAIL=admin@company.local \
BOOTSTRAP_ADMIN_NAME="Администратор ServiceDesk" \
BOOTSTRAP_ADMIN_PASSWORD="change-this-password" \
npm --workspace task-manager-backend run prisma:bootstrap-admin
```

Если в БД уже есть `ADMIN`, bootstrap безопасно остановится и не создаст второго первичного администратора.

## 4. Запустить backend и проверить health

```bash
npm --workspace task-manager-backend run start
```

Проверить:

```bash
curl -i http://localhost:5001/health
```

Ожидаемый ответ: HTTP `200` и `{"status":"OK","message":"Server and DB connected"}`.

## 5. Проверить Yandex email без отправки писем

Заполнить в `.env`:

- `EMAIL_IMAP_USER`
- `EMAIL_IMAP_PASSWORD`
- `EMAIL_SMTP_USER`
- `EMAIL_SMTP_PASSWORD`
- `EMAIL_FROM_ADDRESS`

Базовая проверка env без сетевого логина:

```bash
npm --workspace task-manager-backend run email:yandex:check
```

Сетевая проверка без отправки письма:

```bash
npm --workspace task-manager-backend run email:yandex:check -- --connect-imap --verify-smtp
```

Скрипт не печатает пароли и не вызывает `sendMail`.

## 6. Безопасное включение email

Рекомендуемый порядок:

1. Проверить `email:yandex:check -- --connect-imap --verify-smtp`.
2. Оставить `EMAIL_OUTBOUND_ENABLED=false` и выполнить:

```bash
npm --workspace task-manager-backend run email:reply-smoke
npm --workspace task-manager-backend run email:outbox:retry
```

3. Проверить `GET /api/servicedesk/admin/email-health` под `ADMIN`.
4. Включить `EMAIL_OUTBOUND_ENABLED=true` только после проверки SMTP-логина и адреса отправителя.
5. Включать `EMAIL_OUTBOX_WORKER_ENABLED=true` после ручной проверки retry и согласования интервала.
6. Включать `EMAIL_INTAKE_ENABLED=true` после теста на отдельном mailbox или малом количестве писем.

## 7. Проверить Freshdesk import на samples

```bash
npm --workspace task-manager-backend run import:freshdesk -- --file samples/freshdesk-import-sample.json --dry-run
npm --workspace task-manager-backend run import:freshdesk -- --file samples/freshdesk-import-sample.csv --dry-run
```

Для реального экспорта:

1. Подготовить JSON/CSV на 20-50 заявок.
2. Запустить dry-run:

```bash
npm --workspace task-manager-backend run import:freshdesk -- --file /path/to/freshdesk-small-export.json --dry-run
```

3. Проверить summary/errors.
4. Запустить реальный import без `--dry-run`.
5. Повторить тот же import второй раз и убедиться, что дубли не создаются.
6. В UI/API проверить несколько заявок: `externalId`, `externalNumber`, requester email, комментарии `PUBLIC/INTERNAL`, attachment metadata.

Admin API для frontend/staging:

- `POST /api/servicedesk/admin/freshdesk-import/dry-run`
- `POST /api/servicedesk/admin/freshdesk-import`
- `GET /api/servicedesk/admin/freshdesk-import/runs`
- `GET /api/servicedesk/admin/freshdesk-import/runs/:id`

Payload: массив заявок или `{ "tickets": [...], "fileName": "freshdesk-export.json" }`.

## 8. Smoke перед передачей стенда

Backend должен пройти:

```bash
npm run build:contracts
npm --workspace task-manager-backend run prisma:validate
npm --workspace task-manager-backend run prisma:migrate:deploy
npm --workspace task-manager-backend run test:db
npm --workspace task-manager-backend run smoke:servicedesk
npm --workspace task-manager-backend run email:smoke
npm --workspace task-manager-backend run email:reply-smoke
npm --workspace task-manager-backend run email:outbox:retry
```

Если smoke использует HTTP API, backend должен быть запущен, а `SMOKE_BASE_URL` должен указывать на staging backend.

## 9. Что не включать до ручной проверки

- Не включать `EMAIL_OUTBOUND_ENABLED=true`, пока не проверены SMTP credentials и отправитель.
- Не включать `EMAIL_NOTIFICATIONS_ENABLED=true`, пока не проверены ссылки `PORTAL_BASE_URL` и outbox.
- Не включать worker, пока manual retry не прошёл без ошибок.
- Не запускать полный Freshdesk import до успешного dry-run и реального импорта на 20-50 заявках.
