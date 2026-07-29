# Windows quick start

Актуально на 2026-04-22.

## Требования

- Node.js LTS.
- PostgreSQL.
- Git Bash или PowerShell.

## Шаги

```powershell
cd C:\path\to\task_bogdan
npm install
npm run build:contracts
npm --workspace task-manager-backend run prisma:migrate:deploy
npm --workspace task-manager-backend run prisma:seed
npm run dev:backend
```

Во втором терминале:

```powershell
cd C:\path\to\task_bogdan
npm run dev:frontend
```

## Env

Backend `.env` должен содержать `DATABASE_URL`, `PORT=5001`, `JWT_SECRET`, `CORS_ORIGINS`.

Frontend `.env`:

```env
VITE_API_URL=/api
```

## Проверка

- `http://localhost:5001/health`
- `http://localhost:5173`

## Если не стартует

- Проверить, запущен ли PostgreSQL.
- Проверить `DATABASE_URL`.
- Проверить CORS origin.
- Запустить backend smoke только после старта сервера.
