# Окружение и запуск

Актуально на 2026-04-23.

## Требования

- Node.js с поддержкой workspaces.
- PostgreSQL.
- npm.

## Backend env

Файл: `task-manager-backend/.env`.

```env
DATABASE_URL=postgresql://taskmanager_app:taskmanager_app@localhost:5432/taskmanager_dev?schema=public
PORT=5001
JWT_SECRET=taskmanager_dev_jwt_secret_change_in_prod
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000
BACKUP_ENABLED=false
BACKUP_DIR=backups
BACKUP_RETENTION_DAYS=2
BACKUP_HOUR=3
BACKUP_MINUTE=0
EMAIL_INTAKE_ENABLED=false
EMAIL_IMAP_HOST=imap.yandex.ru
EMAIL_IMAP_PORT=993
EMAIL_IMAP_SECURE=true
EMAIL_IMAP_USER=
EMAIL_IMAP_PASSWORD=
EMAIL_INTAKE_MAILBOX=INBOX
EMAIL_INTAKE_MAX_MESSAGES=30
EMAIL_INTAKE_POLL_INTERVAL_MS=300000
EMAIL_DEFAULT_FOLDER_ID=
EMAIL_OUTBOUND_ENABLED=false
EMAIL_SMTP_HOST=smtp.yandex.ru
EMAIL_SMTP_PORT=465
EMAIL_SMTP_SECURE=true
EMAIL_SMTP_USER=
EMAIL_SMTP_PASSWORD=
EMAIL_FROM_ADDRESS=
EMAIL_FROM_NAME=Office ServiceDesk
```

## Frontend env

Файл: `task-manager-frontend/.env`.

```env
VITE_API_URL=/api
```

## Первый запуск

```bash
cd /Users/hatss/Documents/task_bogdan
npm install
npm run build:contracts
npm --workspace task-manager-backend run prisma:migrate:deploy
npm --workspace task-manager-backend run prisma:seed
npm run dev:backend
```

Второй терминал:

```bash
cd /Users/hatss/Documents/task_bogdan
npm run dev:frontend
```

## Проверка

- Backend health: `http://localhost:5001/health`.
- Frontend: `http://localhost:5173`.
- Не использовать `127.0.0.1:5173`, если он не добавлен в `CORS_ORIGINS`.

## Частые проблемы

- `fetch failed` в smoke - backend не запущен.
- CORS ошибка - origin frontend не входит в `CORS_ORIGINS`; для локального запуска нужны и `localhost:5173`, и `127.0.0.1:5173`.
- Prisma connection error - PostgreSQL не запущен или неверный `DATABASE_URL`.
- Frontend 404 по merge - проверить выравнивание `merge-info` и `close-approve`.
- Backup падает с `pg_dump`/`pg_restore` not found - установить PostgreSQL client utilities на сервере.
- Плановый backup не запускается - проверить, что backend запущен постоянно и `BACKUP_ENABLED=true`.
- `email:sync` падает из-за логина - проверить пароль приложения/IMAP-доступ в Яндекс почте.
- Email-заявки не попадают в нужную папку - проверить `EMAIL_DEFAULT_FOLDER_ID` или оставить пустым для общей очереди.
- `email:reply-smoke` отправляет письмо - проверить, что `EMAIL_OUTBOUND_ENABLED=false`.
