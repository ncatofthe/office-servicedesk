# Структура проекта

Актуально на 2026-04-22.

```text
task_bogdan/
  README.md
  SERVICEDESK_TZ_v2_FINAL.md
  SERVICEDESK_MVP_TZ_v1.md
  SERVICEDESK_2W_EXECUTION_PLAN.md
  SERVICEDESK_AGENT_PROMPTS_v1.md
  AI_AGENT_PLAYBOOK_SERVICEDESK.md
  docs/
  packages/contracts/
  task-manager-backend/
  task-manager-frontend/
```

## Что считать актуальной документацией

Актуальны документы в корне и `docs/`. Папка `docs/archive` хранит старые аудиты и планы, её не нужно использовать как источник текущей правды.

## Что не трогать без причины

- `node_modules`.
- `task-manager-backend/uploads`.
- `.pgdata-taskmgr`.
- `test-results`.
- `backups`.

## Где искать правду

- Продукт: `SERVICEDESK_TZ_v2_FINAL.md`.
- API: `docs/API_OVERVIEW.md`.
- Запуск: `docs/ENVIRONMENT_AND_RUN.md`.
- Backup: `docs/BACKUPS.md`.
- Ограничения: `docs/KNOWN_LIMITATIONS.md`.
- Агентские задачи: `AI_AGENT_PLAYBOOK_SERVICEDESK.md`.
