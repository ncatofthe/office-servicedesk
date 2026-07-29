# Code map

Актуально на 2026-04-23.

## Backend

- `src/app.js` - Express app, middleware, route mounting.
- `src/server.js` - запуск сервера.
- `src/routes/task.routes.js` - task API, merge, close approval.
- `src/controllers/task.controller.js` - request/response слой задач.
- `src/services/task.service.js` - бизнес-логика задач.
- `src/serializers/task.serializer.js` - форма ответа task DTO.
- `src/routes/servicedesk.routes.js` - справочники.
- `src/services/servicedesk.service.js` - CRUD справочников.
- `prisma/schema.prisma` - модели БД.
- `prisma/seed.js` - демо-данные.
- `scripts/servicedesk-smoke.js` - smoke ServiceDesk.
- `scripts/merge-approval-smoke.js` - smoke merge/approval.
- `src/services/backup.service.js` - dump/restore, retention и scheduler backup.
- `scripts/db-backup.js` - CLI для ручного backup/restore.
- `src/services/email-intake.service.js` - IMAP intake, создание внешнего пользователя и заявки.
- `src/services/email-outbound.service.js` - SMTP/dry-run ответ заявителю из email-заявки.
- `src/services/knowledge.service.js` - CRUD и поиск базы знаний.
- `src/routes/knowledge.routes.js` - API базы знаний.
- `scripts/email-intake-smoke.js` - smoke email intake без реального ящика.
- `scripts/email-intake-sync.js` - one-shot IMAP sync.
- `scripts/email-reply-smoke.js` - smoke email reply в dry-run.
- `scripts/knowledge-smoke.js` - smoke CRUD базы знаний.

## Frontend

- `src/App.tsx` - routes.
- `src/access.ts` - роли, capabilities, меню.
- `src/api/index.ts` - API wrappers.
- `src/types/index.ts` - frontend types.
- `src/store/useAppStore.ts` - task/user store.
- `src/pages/TasksPage.tsx` - заявки.
- `src/pages/KanbanPage.tsx` - очередь.
- `src/pages/ServiceDeskAdminPage.tsx` - админка справочников.
- `src/pages/KnowledgePage.tsx` - база знаний.
- `src/components/TaskDetailsModal.tsx` - детальная работа с заявкой.
- `src/components/ui/TaskCard.tsx` - карточка заявки.

## Contracts

- `packages/contracts` - shared DTO/runtime schemas.
- После изменения contracts запускать `npm run build:contracts`.
