# Office ServiceDesk

Внутренний ServiceDesk для компаний: единый портал заявок, очередей, комментариев, вложений, базы знаний, почтовых обращений и администрирования.

Проект вырос из task manager в рабочий продукт для офисных и операционных процессов. Сейчас решение используется несколькими компаниями и помогает заменить хаотичные обращения в мессенджерах, почте и внешних helpdesk-инструментах.

## Что умеет система

- регистрация и вход по логину/паролю;
- создание и обработка заявок через web-интерфейс;
- папки ServiceDesk для IT, склада, операций, маркетплейсов и других направлений;
- настраиваемые справочники: папки, сущности, типы, подтипы, команды исполнителей;
- очередь заявок, Kanban, фильтры, поиск и карточка заявки;
- статусы и workflow для обработки обращений;
- комментарии, вложения, история изменений и timeline;
- роли, ограничения доступа и права по папкам;
- база знаний с поиском и вставкой ссылок в комментарии;
- email intake через IMAP: создание заявок из входящих писем;
- email reply/outbox через SMTP с dry-run режимом, ретраями и dedupe;
- настройки почты и уведомлений в административном интерфейсе;
- центр уведомлений, непрочитанные сообщения и аватары пользователей;
- ручные и плановые backup PostgreSQL и пользовательских файлов;
- импорт данных из Freshdesk API v2;
- smoke-тесты и Playwright e2e для ключевых сценариев.

## Результат

- продукт используется в реальных рабочих процессах;
- ServiceDesk применяют 3 компании;
- система закрывает задачи поддержки, заявок, коммуникации и внутреннего контроля;
- проект доведен до состояния, где есть документация, проверки, deploy-инструкции и эксплуатационные сценарии.

## Стек

- Frontend: React, TypeScript, Vite, React Router, Zustand, Recharts, lucide-react.
- Backend: Node.js, Express, Prisma, PostgreSQL.
- Интеграции: IMAP, SMTP, Freshdesk API.
- Проверки: Node test runner, Supertest, Playwright.

## Структура

```text
office-servicedesk/
├── task-manager-backend/    # Express, Prisma, PostgreSQL, API и бизнес-логика
├── task-manager-frontend/   # React/Vite интерфейс портала
├── packages/contracts/      # общие DTO и runtime-схемы
├── docs/                    # документация по архитектуре, запуску, ролям и эксплуатации
├── deploy/                  # локальный deploy и systemd-конфиги
└── e2e/                     # браузерные smoke-сценарии
```

## Быстрый запуск

```bash
npm install
npm run build:contracts
npm --workspace task-manager-backend run prisma:migrate:deploy
npm --workspace task-manager-backend run prisma:seed
npm run dev:backend
```

В отдельном терминале:

```bash
npm run dev:frontend
```

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:5001`
- Health: `http://localhost:5001/health`

## Проверки

```bash
npm --workspace task-manager-backend run prisma:validate
npm --workspace task-manager-backend run smoke:servicedesk
npm --workspace task-manager-backend run smoke:merge-approval
npm --workspace task-manager-backend run email:smoke
npm --workspace task-manager-backend run email:reply-smoke
npm --workspace task-manager-backend run knowledge:smoke
npm run test:e2e:smoke
npm --workspace task-manager-frontend run lint
npm --workspace task-manager-frontend run build
```

Полная release-проверка:

```bash
npm run check:release
```

## Документация

- [API overview](./docs/API_OVERVIEW.md)
- [Architecture](./docs/ARCHITECTURE.md)
- [Environment and run](./docs/ENVIRONMENT_AND_RUN.md)
- [Production deploy](./docs/PRODUCTION_DEPLOY.md)
- [RBAC](./docs/RBAC.md)
- [Email](./docs/EMAIL.md)
- [Notifications](./docs/NOTIFICATIONS.md)
- [Backups](./docs/BACKUPS.md)
- [Freshdesk import](./docs/FRESHDESK_IMPORT.md)
- [Testing](./docs/TESTING.md)
