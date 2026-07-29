@echo off
setlocal ENABLEEXTENSIONS

REM Safe local launcher for Windows 10.
REM It does not create/drop databases, does not run seed, and does not reset Prisma.

for %%I in ("%~dp0..") do set "ROOT_DIR=%%~fI"
cd /d "%ROOT_DIR%"

echo.
echo ==========================================
echo   Task Manager local start (Windows 10)
echo ==========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found in PATH.
  echo Install Node.js LTS first, then re-run this script.
  goto :fail
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm not found in PATH.
  echo Install Node.js with npm first, then re-run this script.
  goto :fail
)

if not exist "package.json" (
  echo [ERROR] package.json not found in %ROOT_DIR%
  echo Open this script from the project repository and try again.
  goto :fail
)

if not exist "task-manager-backend\.env" (
  echo [ERROR] Missing task-manager-backend\.env
  echo Copy task-manager-backend\.env.example to task-manager-backend\.env and fill in DATABASE_URL/JWT_SECRET.
  goto :fail
)

if not exist "node_modules" (
  echo [INFO] node_modules not found. Installing workspace dependencies...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    goto :fail
  )
) else (
  echo [OK] Dependencies already installed.
)

echo.
echo [INFO] Running Prisma generate for backend...
call npm --workspace task-manager-backend run prisma:generate
if errorlevel 1 (
  echo [ERROR] Prisma generate failed.
  echo Check backend dependencies and Prisma setup, then try again.
  goto :fail
)

echo.
echo [IMPORTANT] Before manual testing, make sure:
echo   1. PostgreSQL is running
echo   2. task-manager-backend\.env points to an existing dev database
echo   3. Checked-in Prisma migrations were already applied manually via:
echo      npm --workspace task-manager-backend run prisma:migrate:deploy
echo.
echo [IMPORTANT] This script does NOT:
echo   - create databases
echo   - run prisma migrate reset
echo   - run prisma db push
echo   - run seed
echo.

if not exist "task-manager-backend\.env.test" (
  echo [NOTE] task-manager-backend\.env.test was not found.
  echo DB-backed tests will need a dedicated test DB and .env.test later.
  echo.
)

echo [INFO] Starting backend in a new window...
start "Task Manager Backend" cmd /k "cd /d \"%ROOT_DIR%\" && npm --workspace task-manager-backend run start"

echo [INFO] Starting frontend in a new window...
start "Task Manager Frontend" cmd /k "cd /d \"%ROOT_DIR%\" && npm --workspace task-manager-frontend run dev"

echo.
echo [DONE] Start commands were sent.
echo Open the app at:
echo   http://localhost:5173
echo.
echo Backend health check:
echo   http://localhost:5001/health
echo.
echo Use localhost, not 127.0.0.1, unless backend CORS was explicitly expanded.
goto :eof

:fail
echo.
echo Startup aborted.
exit /b 1
