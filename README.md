# Office ServiceDesk

Актуальная документация: 2026-07-19.

Проект переведён из task manager во внутренний ServiceDesk для офиса 50-60 человек. Цель продукта - заменить ежедневный Freshdesk-поток и дать IT/операционным исполнителям единый портал: заявки, очередь, справочники, вложения, комментарии, почта, база знаний, объединение заявок и администрирование.

## Что уже работает

- Регистрация и вход по логину/паролю.
- Создание заявок через веб-интерфейс.
- Папки ServiceDesk: IT, склад, операции, маркетплейсы и любые новые направления.
- Настраиваемые справочники: папки, сущности, типы, подтипы, команды исполнителей.
- Публичное брендирование и singleton-настройки продукта: название портала/компании, приветствие, locale, timezone, приоритет и папка по умолчанию.
- Очередь заявок, Kanban-вид, фильтры, поиск, карточка заявки.
- Упрощённый workflow для MVP: `Необработано -> В процессе -> Закрыто`.
- Комментарии и вложения к заявкам.
- Роли и базовые ограничения доступа.
- Backend API для слияния заявок LINK/UNION и согласованного закрытия.
- Ручные и плановые backup PostgreSQL с retention 2 дня.
- Ручные backup пользовательских файлов из `uploads` в общей backup-структуре.
- Backend MVP email intake: one-shot/scheduler IMAP, автосоздание внешнего пользователя и заявки.
- Backend MVP email reply: SMTP dry-run по умолчанию, threading через `EmailInboundMessage`.
- Backend automation rules v1: admin CRUD, dry-run, execution log, triggers `TASK_CREATED` и `EMAIL_TICKET_CREATED`.
- База знаний: CRUD статей, поиск, страница `/knowledge`, вставка ссылки в комментарий заявки.
- Smoke-проверки ServiceDesk и merge approval.
- Playwright e2e smoke suite для ключевых пользовательских сценариев ServiceDesk.
- Перенос из Freshdesk API v2: dry-run, пилот/дельта-импорт, старые номера и даты, все conversations, пользователи и опциональные вложения.

## Главные директории

- `task-manager-backend` - Express, Prisma, PostgreSQL, API и бизнес-логика.
- `task-manager-frontend` - React/Vite UI портала.
- `packages/contracts` - общие DTO/runtime-схемы.
- `docs` - рабочая документация по продукту, API, запуску, ролям и тестированию.


## Быстрый запуск

```bash
cd /Users/hatss/Documents/task_bogdan
npm install
npm run build:contracts
npm --workspace task-manager-backend run prisma:migrate:deploy
npm --workspace task-manager-backend run prisma:seed
npm run dev:backend
```

В отдельном терминале:

```bash
cd /Users/hatss/Documents/task_bogdan
npm run dev:frontend
```

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:5001`
- Health: `http://localhost:5001/health`

## Проверки перед демо

```bash
npm --workspace task-manager-backend run prisma:validate
npm --workspace task-manager-backend run smoke:servicedesk
npm --workspace task-manager-backend run smoke:merge-approval
npm --workspace task-manager-backend run email:smoke
npm --workspace task-manager-backend run email:reply-smoke
npm --workspace task-manager-backend run knowledge:smoke
npm run test:e2e:smoke
npm --workspace task-manager-backend run backup:create
npm --workspace task-manager-backend run backup:list
npm --workspace task-manager-backend run backup:files:create
npm --workspace task-manager-backend run backup:files:list
npm --workspace task-manager-frontend run lint
npm --workspace task-manager-frontend run build
```

Полную проверку release candidate можно запустить одной командой:

```bash
npm run check:release
```

Она проверяет production-зависимости, shared contracts, Prisma, backend DB-тесты,
frontend lint/build и критические браузерные сценарии Playwright.

## Demo-аккаунты

- `admin@taskmanager.com / password123` - `ADMIN`
- `manager@taskmanager.com / password123` - `AGENT`
- `employee@taskmanager.com / password123` - `AGENT`
- `support@taskmanager.com / password123` - `AGENT`
- `requester@taskmanager.com / password123` - `REQUESTER`
- `viewer@taskmanager.com / password123` - `VIEWER`

## Важное состояние интеграции

Frontend и backend выровнены по canonical merge API: `GET /api/tasks/:id/merge-info`, `POST /api/tasks/:id/merge`, `POST /api/tasks/:id/close-approve`, payload `mergeMode/childTaskIds`.

## Документация

- [ТЗ](./SERVICEDESK_TZ_v2_FINAL.md)
- [MVP scope](./SERVICEDESK_MVP_TZ_v1.md)
- [План на 2 недели](./SERVICEDESK_2W_EXECUTION_PLAN.md)
- [API](./docs/API_OVERVIEW.md)
- [Automation rules](./docs/AUTOMATION_RULES.md)
- [Запуск](./docs/ENVIRONMENT_AND_RUN.md)
- [Backup](./docs/BACKUPS.md)
- [Локальный офисный сервер](./docs/LOCAL_VM_DEPLOY.md)
- [Production deploy](./docs/PRODUCTION_DEPLOY.md)
- [Staging launch pack](./docs/STAGING_LAUNCH_PACK.md)
- [Operational checklist](./docs/OPERATIONS_CHECKLIST.md)
- [Роли](./docs/RBAC.md)
- [Аудит административной настраиваемости](./docs/ADMIN_CONFIGURATION_AUDIT.md)
- [E2E smoke](./docs/E2E_SMOKE.md)
- [Перенос из Freshdesk](./docs/FRESHDESK_IMPORT.md)
- [Чек-лист миграции Freshdesk](./docs/FRESHDESK_MIGRATION_CHECKLIST.md)
- [Ограничения](./docs/KNOWN_LIMITATIONS.md)
