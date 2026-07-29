# Тестирование

Актуально на 2026-04-23.

## Быстрый набор перед коммитом

```bash
npm --workspace task-manager-backend run prisma:validate
npm --workspace task-manager-backend run smoke:servicedesk
npm --workspace task-manager-backend run smoke:merge-approval
npm --workspace task-manager-backend run email:smoke
npm --workspace task-manager-backend run email:reply-smoke
npm --workspace task-manager-backend run knowledge:smoke
npm --workspace task-manager-backend run backup:create
npm --workspace task-manager-backend run backup:list
npm --workspace task-manager-backend run backup:files:create
npm --workspace task-manager-backend run backup:files:list
npm --workspace task-manager-frontend run lint
npm --workspace task-manager-frontend run build
```

## Backend smoke

- `smoke:servicedesk` проверяет справочники и создание заявки.
- `smoke:merge-approval` проверяет UNION как единый блок: общий номер master/child, скрытие child из общего списка, блокировку DONE до approvals и финальный DONE для всей связки.
- `email:smoke` проверяет создание внешнего пользователя, заявки и записи обработанного письма без реального IMAP.
- `email:reply-smoke` проверяет dry-run ответ по email-заявке и создание внутреннего комментария.
- `knowledge:smoke` проверяет CRUD базы знаний.

Smoke требует запущенный backend на `localhost:5001`.

## Backup checks

- `backup:create` должен создать `.dump` и `.dump.json` в `backups`.
- `backup:list` должен показать свежий файл с ненулевым размером.
- `backup:files:create` должен создать `.tar.gz` и `.tar.gz.json` в `backups/files`.
- `backup:files:list` должен показать свежий файловый архив и число файлов в manifest.
- `backup:files:restore` в пустую временную папку должен завершаться без ошибки.
- `backup:cleanup` должен завершаться без ошибки.
- `backup:files:cleanup` должен завершаться без ошибки.
- `backup:next-run` должен показывать следующий запуск на 03:00 локального времени сервера.

## Ручные сценарии

1. Login admin.
2. Открыть `/admin`, создать папку/тип/подтип.
3. Login requester, создать заявку.
4. Login agent/admin, назначить исполнителей.
5. Открыть заявку, добавить комментарий и файл.
6. Объединить две заявки через UNION.
7. Проверить close approval двумя исполнителями.

## Что считать регрессией

- REQUESTER не может создать заявку.
- `/api/servicedesk/folders` отдаёт 403 авторизованному пользователю.
- Frontend отправляет `folderId` как `departmentId`.
- Frontend использует старые merge endpoint names.
- `npm run build` падает после изменения типов.
- `backup:create` оставляет нулевой `.dump` после ошибки.
- `email:smoke` не создаёт taskId/userId или начинает требовать реальные Яндекс credentials.
- `email:reply-smoke` отправляет реальное письмо вместо dry-run.
- `knowledge:smoke` падает после изменения прав или serializer.
