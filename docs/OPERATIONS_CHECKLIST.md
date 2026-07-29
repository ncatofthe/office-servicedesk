# Operational checklist

Актуально на 2026-04-25.

## Before release

- `npm install` выполнен без ошибок.
- `npm run build:contracts` прошёл.
- `npm --workspace task-manager-backend run prisma:validate` прошёл.
- `npm --workspace task-manager-backend run smoke:servicedesk` прошёл.
- `npm --workspace task-manager-backend run smoke:merge-approval` прошёл.
- `npm --workspace task-manager-backend run email:smoke` прошёл.
- `npm --workspace task-manager-backend run email:reply-smoke` прошёл.
- `npm --workspace task-manager-backend run backup:create` создал свежий dump.
- `npm --workspace task-manager-backend run backup:files:create` создал свежий архив uploads.
- `npm --workspace task-manager-frontend run build` прошёл.

## After deploy

- Backend service в статусе `active/running`.
- Frontend открывается с production URL.
- `GET /health` отвечает `200`.
- Логин `ADMIN` проходит.
- Создание заявки проходит.
- Вложения загружаются и скачиваются.
- Справочники ServiceDesk читаются обычным пользователем.
- Merge/approval сценарий не сломан.
- Плановый DB backup включён, если это production.
- На сервере есть свежие DB и files backup.

## Disaster recovery basics

- Знать, где лежит `BACKUP_DIR`.
- Хранить минимум один свежий `.dump` и один свежий `.tar.gz` для uploads.
- Перед restore остановить backend.
- Сначала восстановить БД, затем файловый архив uploads.
- После восстановления поднять backend и прогнать smoke.
- Если восстановление делается в новый каталог, проверить права доступа к `uploads`.
