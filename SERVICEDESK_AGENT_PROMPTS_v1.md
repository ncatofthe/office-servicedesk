# Промпты для AI-агентов

Актуально на 2026-04-23.

## Настройки

- Backend: `gpt-5.2-codex`, reasoning `high`.
- Frontend: `gpt-5.2-codex`, reasoning `medium`, при сложных типах `high`.
- Reviewer: `gpt-5.2-codex`, reasoning `high`.

## Общие правила для всех агентов

- Работать только в своей области: backend или frontend.
- Не менять auth flow без отдельного согласования.
- Не ломать существующие smoke и build.
- В конце всегда давать список файлов и результаты команд.
- Любой новый backend-контракт должен быть отражён во frontend types/api.

## Prompt: выравнивание merge frontend/backend

```text
Работаешь только в task-manager-frontend.
Нужно выровнять UI merge/close approval с canonical backend API.
Backend использует:
- GET /api/tasks/:id/merge-info
- POST /api/tasks/:id/merge с payload { mergeMode, childTaskIds, reason }
- POST /api/tasks/:id/close-approve
Исправь src/api/index.ts, src/types/index.ts и TaskDetailsModal.tsx.
Проверь npm run lint и npm run build.
```

## Prompt: email intake

```text
Статус: backend MVP email intake и email reply уже реализованы. Не выдавать этот prompt повторно без уточнения задачи.

Следующая задача по email: production hardening.
Нужно добавить журнал исходящих писем, retry/error state, UI-кнопку email-ответа в карточке заявки и ручную проверку на тестовом Яндекс-ящике.
Не меняй auth flow и не отправляй реальные письма в smoke.
```

## Prompt: база знаний

```text
Статус: MVP базы знаний уже реализован. Не выдавать этот prompt повторно без уточнения задачи.

Следующая задача по базе знаний: hardening UX.
Нужно добавить шаблоны быстрых ответов на основе статей, улучшить поиск в карточке заявки, добавить версии/историю изменений статей или хотя бы audit поля в UI.
```

## Prompt: backup

```text
Статус: backend CLI/scheduler уже реализованы. Не выдавать этот prompt повторно без уточнения задачи.

Следующая задача по backup: добавь резервирование task-manager-backend/uploads, регламент restore на тестовую БД и, если нужно, админский UI только для просмотра списка backup.
Не удаляй реальные данные при restore без явного флага подтверждения и отдельного подтверждения владельца проекта.
```
