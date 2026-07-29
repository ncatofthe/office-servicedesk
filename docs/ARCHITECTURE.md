# Архитектура

Актуально на 2026-05-15.

## Слои

- Frontend: React 19, Vite, Zustand, React Router, lucide-react.
- Backend: Express 5, CommonJS, Prisma Client.
- Database: PostgreSQL.
- Contracts: `packages/contracts` для общих DTO/runtime-схем.

## Backend flow

Route -> validation middleware -> controller -> service -> Prisma -> serializer -> response.

Ключевые сервисы:

- `task.service.js` - заявки, статусы, merge, approvals, assignees.
- `servicedesk.service.js` - справочники ServiceDesk.
- `backup.service.js` - PostgreSQL dump/restore, retention и scheduler.
- `email-intake.service.js` - IMAP polling, дедупликация писем, создание заявок.
- `review.service.js` - legacy-код старого review/payment контура; route не подключён в runtime.
- `notification.service.js` - уведомления.

## Данные

Основная сущность - `Task`. Для ServiceDesk она расширена ссылками на `TicketFolder`, `TicketEntity`, `TicketType`, `TicketSubtype`. Для объединения используются `TaskMerge` и `TaskCloseApproval`.

Email intake хранит обработанные письма в `EmailInboundMessage`, чтобы повторный IMAP sync не создавал дубли заявок.

## Статусы задач

- `NEW` - новая заявка.
- `IN_PROGRESS` - в работе.
- `DONE` - закрыта.
- `MERGED` - дочерняя заявка объединена в мастер через `UNION`.

Для пользовательского MVP workflow сведён к трём состояниям: `NEW`, `IN_PROGRESS`, `DONE`. Legacy-статусы `REVIEW`, `POSTPONED`, `REWORK` поддерживаются backend только ради совместимости со старыми данными и отображаются как `IN_PROGRESS`.

## Merge model

- `LINK` связывает заявки без изменения статусов.
- `UNION` превращает выбранные child-заявки в `MERGED` и ведёт работу в master-заявке.
- Для master-заявки с несколькими исполнителями закрытие требует подтверждения каждого исполнителя.

## Frontend flow

Страницы используют `src/api/index.ts`, общий store `useAppStore`, типы из `src/types/index.ts`. Навигация и capability matrix лежат в `src/access.ts`.

## Точки риска

- При добавлении endpoint нужно сразу обновлять frontend API wrapper.
- Shared contracts не покрывают все новые ServiceDesk поля, поэтому backend использует passthrough.
- Merge frontend/backend выровнен на `merge-info`, `close-approve`, `mergeMode` и `childTaskIds`; при изменениях держать этот контракт единым.
- Backup БД не включает файлы из `uploads`, для них нужен отдельный серверный backup.
- Finance/review routes старого task-manager контура отключены из `src/app.js`; не возвращать их в runtime без отдельного product decision.
