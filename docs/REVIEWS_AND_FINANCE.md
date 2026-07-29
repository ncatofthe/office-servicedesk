# Legacy reviews и finance

Актуально на 2026-05-15.

## Статус

`reviews` и `finance` - наследуемые модули старого task-manager контура. В production ServiceDesk они отключены из runtime и не должны восприниматься как активный продуктовый API.

Отключённые HTTP endpoints:

- `/api/reviews`
- `/api/accounts`
- `/api/transactions`

## Что сохранено

В кодовой базе пока сохранены:

- `src/routes/review.routes.js`
- `src/controllers/review.controller.js`
- `src/services/review.service.js`
- `src/routes/finance.routes.js`
- `src/controllers/finance.controller.js`
- `src/services/finance.service.js`
- `src/services/ledger.service.js`
- Prisma-модели `TaskReview`, `Account`, `Transaction`

Они не монтируются в `src/app.js`. Исторические миграции не удаляются.

## Почему так

Удалять таблицы и миграции сейчас рискованнее, чем изолировать runtime:

- могли остаться исторические данные;
- rollback старых окружений должен быть предсказуемым;
- часть safety-кода удаления пользователей всё ещё умеет видеть старые финансовые блокеры;
- Prisma migration history нельзя переписывать в production-проекте.

## Чем заменено

Для ServiceDesk используются:

- заявки и статусы в `/api/tasks`;
- согласованное закрытие через `TaskCloseApproval`;
- merge/close approval вместо старых `reviews`;
- SLA, timeline, canned replies, email reply/intake;
- `GET /api/reports` как ServiceDesk statistics без финансовых метрик.

Новые фичи не должны расширять legacy finance/review слой.
