# Task Manager Project Launch TODO

**Status: Approved plan - PostgreSQL DB 'taskmanager'**

## Steps:

### 1. Create PostgreSQL Database [x]
(Already exists)

### 2. Setup Backend .env [PENDING]
- Check/read task-manager-backend/.env
- Ensure: DATABASE_URL="postgresql://hatss@localhost:5432/taskmanager"
- JWT_SECRET, PORT=5001 etc.

### 3. Backend Dependencies & Prisma Setup [x]
(deps/db-push/generate/seed complete)
```bash
cd task-manager-backend
npm install
npm run prisma:generate
npm run prisma:migrate dev --name init
npm run prisma:seed
```

### 4. Run Backend Server [x]
(running on 5001)
```bash
npm run dev
```
Backend at http://localhost:5001/health

### 5. Setup Frontend .env [x]
(exists, VITE_API_URL set)
- Copy task-manager-frontend/.env.example -> .env
- VITE_API_URL=http://localhost:5001/api

### 6. Frontend Dependencies & Run [x]
(running on 5173)
```bash
cd task-manager-frontend
npm install
npm run dev
```
Frontend at http://localhost:5173

### 7. Test [READY]
Login admin@taskmanager.com / password123
- Login: admin@taskmanager.com / password123
- Check Dashboard, Tasks, etc.
- Backend /api/health

**Next: Execute step-by-step, mark [x] when done.**

