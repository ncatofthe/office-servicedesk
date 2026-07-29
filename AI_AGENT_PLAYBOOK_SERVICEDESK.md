# AI Agent Playbook ServiceDesk

Актуально на 2026-04-23.

## Роли агентов

- Backend worker: Prisma, Express routes, сервисы, smoke scripts.
- Frontend worker: React pages, components, API client, types.
- Reviewer: ищет несовпадения контрактов, регрессии ролей, сломанные проверки.
- Docs worker: обновляет README/docs после стабилизации контракта.

## Как давать задачи

1. Давать один ограниченный слой: backend или frontend.
2. Указывать canonical endpoint и payload.
3. Указывать команды проверки.
4. Просить отчёт: файлы, что изменено, что проверено, что осталось.

## Что проверять после пары агентов

- Совпадают ли URL.
- Совпадают ли имена payload полей.
- Совпадают ли enum статусов.
- Есть ли frontend fallback только там, где он нужен.
- Нет ли 403 для обычного пользователя на базовом сценарии создания заявки.

## Текущий важный контракт

- ServiceDesk dictionaries: `/api/servicedesk/*` read-only, `/api/servicedesk/admin/*` admin CRUD.
- Tasks ServiceDesk fields: `folderId`, `entityId`, `typeId`, `subtypeId`.
- Legacy aliases backend принимает, но frontend должен использовать новые поля.
- Merge: `mergeMode`, `childTaskIds`, `merge-info`, `close-approve`.
- Backup: CLI/scheduler через `scripts/db-backup.js`, HTTP API для restore сейчас нет.
- Email intake: CLI/scheduler через `scripts/email-intake-sync.js`, smoke через `email:smoke`, HTTP API сейчас нет.
- Email reply: `POST /api/tasks/:id/email-reply`, dry-run по умолчанию, smoke через `email:reply-smoke`.
- Knowledge base: `/api/knowledge/articles`, frontend `/knowledge`, smoke через `knowledge:smoke`.

## Definition of Done для агента

- Код собирается.
- Smoke или build зелёный.
- Новые endpoints вручную проверены curl или smoke.
- Документация или отчёт фиксируют новый контракт.
- Изменения не затрагивают чужую область без необходимости.
