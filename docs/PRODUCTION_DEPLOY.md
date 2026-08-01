# Production deployment

Актуально на 2026-06-10.

## Что считаем production-сценарием

- backend запускается без `nodemon`;
- frontend собирается статически и обслуживается как `dist`;
- PostgreSQL доступен локально или по приватной сети;
- backup БД и backup файлов лежат в общей папке `backups`;
- deployment выполняется с возможностью rollback.

## Backend без nodemon

Из корня проекта:

```bash
cd /Users/hatss/Documents/task_bogdan
npm install
npm run build:contracts
npm --workspace task-manager-backend run prisma:migrate:deploy
npm --workspace task-manager-backend run prisma:generate
npm --workspace task-manager-backend run start
```

`npm --workspace task-manager-backend run start` уже запускает `node src/server.js` и генерирует Prisma Client перед стартом.

## Frontend preview и static

Временный вариант для внутреннего стенда:

```bash
cd /Users/hatss/Documents/task_bogdan
npm --workspace task-manager-frontend run build
npm --workspace task-manager-frontend run preview -- --host 0.0.0.0 --port 4173
```

Рекомендуемый production-вариант:

```bash
cd /Users/hatss/Documents/task_bogdan
npm --workspace task-manager-frontend run build
```

После сборки раздавать содержимое `task-manager-frontend/dist` через Nginx, Caddy или другой статический web server. Это надёжнее, чем держать `vite preview` как постоянный production-процесс.

## Env

Базовый production template: [task-manager-backend/.env.production.example](/Users/hatss/Documents/task_bogdan/task-manager-backend/.env.production.example)

Минимально обязательные поля:

- `DATABASE_URL`
- `JWT_SECRET`
- `CORS_ORIGINS`
- `PORT`

Перед включением email-функций отдельно заполнить SMTP/IMAP credentials.

Для staging дополнительно проверить:

- `PORTAL_BASE_URL` - публичный URL frontend, используется в уведомлениях;
- `CORS_ORIGINS` - все frontend origins staging/production; `CORS_ORIGIN` поддержан как single-origin alias, если `CORS_ORIGINS` не задан;
- `TRUST_PROXY=loopback` - если frontend/API идут через Nginx на той же VM; иначе rate-limit будет видеть только IP proxy;
- `RATE_LIMIT_MAX_REQUESTS=10000` - офисный лимит на IP за 15 минут с запасом для 15-20 сотрудников за общим NAT и фоновых обновлений;
- `AUTH_RATE_LIMIT_MAX_REQUESTS=100` - лимит входов на IP за 15 минут, допускающий одновременное начало смены и повторные попытки;
- `UPLOADS_DIR` - абсолютный путь к пользовательским файлам или пустое значение для `task-manager-backend/uploads`;
- `BACKUP_DIR` - абсолютный путь к локальным backup БД и файлов вне публичной директории frontend;
- `EMAIL_INTAKE_ENABLED=false` до проверки IMAP;
- `EMAIL_OUTBOUND_ENABLED=false` до проверки SMTP;
- `EMAIL_NOTIFICATIONS_ENABLED=false` до проверки outbox;
- `EMAIL_OUTBOX_WORKER_ENABLED=false` до ops-решения о фоновой отправке.

`CORS_ORIGINS` должен содержать точные origins без путей, например `https://servicedesk.company.ru`. Несколько адресов разделяются запятыми. Wildcard `*` backend намеренно отклоняет. При смене домена или временного tunnel нужно обновить allowlist и перезапустить backend; CORS является серверной настройкой безопасности и не должен редактироваться через обычную admin-панель.

Безопасная проверка Yandex env:

```bash
npm --workspace task-manager-backend run email:yandex:check
npm --workspace task-manager-backend run email:yandex:check -- --connect-imap --verify-smtp
```

Эти команды не отправляют реальные письма.

## Быстрый staging-сценарий

Подробный чеклист для первого стенда: [docs/STAGING_DEPLOY.md](/Users/hatss/Documents/task_bogdan/docs/STAGING_DEPLOY.md)

1. Поднять PostgreSQL и создать базу/пользователя.
2. Скопировать `task-manager-backend/.env.production.example` в `.env`.
3. Заполнить `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGINS`, `PORTAL_BASE_URL`.
4. Настроить `UPLOADS_DIR` и `BACKUP_DIR` на локальные серверные директории вне публичного frontend.
5. Выполнить:

```bash
npm install
npm run build:contracts
npm --workspace task-manager-backend run prisma:migrate:deploy
npm --workspace task-manager-backend run prisma:bootstrap-admin
npm --workspace task-manager-backend run start
```

Seed для production/staging не обязателен: демо-данные нужны только для локальной разработки. Первый администратор создаётся через `prisma:bootstrap-admin`.

## Рекомендуемый запуск через systemd

Рекомендуемый вариант для backend - `systemd`.

Пример `/etc/systemd/system/officesd-backend.service`:

```ini
[Unit]
Description=Office ServiceDesk Backend
After=network.target postgresql.service

[Service]
Type=simple
WorkingDirectory=/opt/officesd/task-manager-backend
EnvironmentFile=/opt/officesd/task-manager-backend/.env
ExecStart=/usr/bin/node src/server.js
Restart=always
RestartSec=5
User=servicedesk
Group=servicedesk

[Install]
WantedBy=multi-user.target
```

Если backend запускается из корня монорепозитория, можно использовать:

```ini
WorkingDirectory=/opt/officesd
ExecStart=/usr/bin/node task-manager-backend/src/server.js
```

Frontend static лучше раздавать отдельным web server. Если нужен process-manager вместо `systemd`, допустим `pm2`.

## Вариант через pm2

```bash
cd /opt/officesd
pm2 start "npm --workspace task-manager-backend run start" --name officesd-backend
pm2 save
```

Для frontend preview:

```bash
cd /opt/officesd
pm2 start "npm --workspace task-manager-frontend run preview -- --host 0.0.0.0 --port 4173" --name officesd-frontend-preview
pm2 save
```

Для production всё равно лучше перевести frontend на static hosting.

## Порядок обновления

1. Убедиться, что свежие backup БД и файлов есть перед релизом.
2. Забрать код на сервер.
3. Выполнить `npm install`.
4. Выполнить `npm run build:contracts`.
5. Выполнить `npm --workspace task-manager-frontend run build`.
6. Выполнить `npm --workspace task-manager-backend run prisma:migrate:deploy`.
7. Перезапустить backend service.
8. Обновить или переложить frontend `dist` в каталог web server.
9. Пройти post-deploy checks.

## Rollback

Если проблема только в приложении, а миграции не меняли схему критично:

1. Остановить backend.
2. Вернуть предыдущий релиз кода.
3. Установить зависимости прошлого релиза, если менялись.
4. Перезапустить backend.
5. Переложить предыдущий frontend `dist`.

Если проблема затронула данные:

1. Остановить backend.
2. Восстановить БД из нужного `.dump`.
3. Восстановить `uploads` из подходящего `.tar.gz`.
4. Поднять backend.
5. Пройти smoke и ручные проверки.

Подробности по backup/restore: [docs/BACKUPS.md](/Users/hatss/Documents/task_bogdan/docs/BACKUPS.md)

## Что проверять после deploy

- `GET /health` отвечает `200`.
- `npm --workspace task-manager-backend run email:yandex:check` показывает ожидаемый readiness.
- Dry-run Freshdesk import проходит на sample-файле.
- Логин работает.
- Создание заявки работает.
- Загрузка и скачивание вложения работают.
- `npm --workspace task-manager-backend run smoke:servicedesk` проходит.
- `npm --workspace task-manager-backend run smoke:merge-approval` проходит.
- Если email включён, one-shot `email:sync` и `email:reply-smoke` не падают.

## Замечания по эксплуатации

- Не используем `nodemon` в production.
- `BACKUP_ENABLED=true` включает ежедневный backup PostgreSQL, а `BACKUP_FILES_ENABLED=true` добавляет к тому же запуску архив вложений из `UPLOADS_DIR`.
- `backups` не должен лежать в публичной директории frontend.
