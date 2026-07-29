# Local DB readiness

Актуально на 2026-04-22.

## Цель

Убедиться, что локальная PostgreSQL база готова для разработки и демо ServiceDesk.

## Проверка

```bash
npm --workspace task-manager-backend run prisma:validate
npm --workspace task-manager-backend run prisma:migrate:status
npm --workspace task-manager-backend run prisma:migrate:deploy
npm --workspace task-manager-backend run prisma:seed
npm --workspace task-manager-backend run email:smoke
npm --workspace task-manager-backend run backup:create
npm --workspace task-manager-backend run backup:list
```

## Важные таблицы

- `users`
- `tasks`
- `ticket_folders`
- `ticket_entities`
- `ticket_types`
- `ticket_subtypes`
- `support_teams`
- `task_merges`
- `task_close_approvals`
- `email_inbound_messages`
- `task_comments`
- `task_attachments`

## Что проверить после миграций

- Статус `MERGED` существует в enum `TaskStatus`.
- Enum `TaskMergeMode` содержит `LINK` и `UNION`.
- Seed создаёт администратора и базовые справочники.
- Smoke ServiceDesk и merge approval проходят при запущенном backend.
- Email smoke создаёт запись в `email_inbound_messages` и задачу от внешнего пользователя.
- Backup создаёт dump с ненулевым размером в корневой папке `backups`.
