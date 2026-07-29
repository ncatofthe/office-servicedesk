# ServiceDesk Frontend

Актуально на 2026-04-22.

React/Vite frontend для Office ServiceDesk.

## Start

```bash
cd /Users/hatss/Documents/task_bogdan
npm run dev:frontend
```

Открыть `http://localhost:5173`.

## Scripts

- `npm run dev` - Vite dev server.
- `npm run lint` - ESLint.
- `npm run build` - TypeScript build + Vite build.
- `npm run preview` - preview production build.

## Env

```env
VITE_API_URL=/api
```

## Pages

- `/tickets` - заявки.
- `/queue` - очередь.
- `/admin` - справочники.
- `/team` - пользователи.
- `/reviews` - согласования.
- `/reports` - отчёты.

## ServiceDesk API expectations

- Dictionaries read: `/servicedesk/*`.
- Admin dictionaries: `/servicedesk/admin/*`.
- Task fields: `folderId`, `entityId`, `typeId`, `subtypeId`.
- Merge backend canonical paths: `/tasks/:id/merge-info` and `/tasks/:id/close-approve`.

## Merge

`src/api/index.ts` использует canonical backend paths: `/tasks/:id/merge-info`, `/tasks/:id/merge`, `/tasks/:id/close-approve`.

## Build check

```bash
npm --workspace task-manager-frontend run lint
npm --workspace task-manager-frontend run build
```
