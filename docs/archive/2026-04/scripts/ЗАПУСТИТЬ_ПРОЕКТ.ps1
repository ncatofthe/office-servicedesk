<#
.SYNOPSIS
Автоматический запуск Task Manager (PostgreSQL)

Что делает скрипт:
1) Проверяет Node.js
2) Подготавливает .env из .env.example (если отсутствует)
3) Ставит зависимости backend/frontend
4) Выполняет prisma generate + migrate + seed
5) Запускает backend и frontend
#>

$ErrorActionPreference = "Stop"
$PROJECT_ROOT = $PSScriptRoot
$BACKEND_DIR = Join-Path $PROJECT_ROOT "task-manager-backend"
$FRONTEND_DIR = Join-Path $PROJECT_ROOT "task-manager-frontend"

Write-Host "`n=============================================="
Write-Host "Запуск Task Manager"
Write-Host "==============================================`n"

# Проверка Node.js
Write-Host "[1/7] Проверка Node.js..."
try {
    $nodeVersion = node --version
    Write-Host "Node.js: $nodeVersion"
} catch {
    Write-Host "Node.js не найден. Установите Node.js 20+ с https://nodejs.org/"
    pause
    exit 1
}

# Проверка каталогов
if (!(Test-Path $BACKEND_DIR)) {
    Write-Host "Не найден backend каталог: $BACKEND_DIR"
    exit 1
}
if (!(Test-Path $FRONTEND_DIR)) {
    Write-Host "Не найден frontend каталог: $FRONTEND_DIR"
    exit 1
}

# Backend env
Write-Host "[2/7] Проверка backend .env..."
$backendEnv = Join-Path $BACKEND_DIR ".env"
$backendEnvExample = Join-Path $BACKEND_DIR ".env.example"
if (!(Test-Path $backendEnv)) {
    if (Test-Path $backendEnvExample) {
        Copy-Item $backendEnvExample $backendEnv
        Write-Host "Создан $backendEnv из .env.example"
    } else {
        Write-Host "Не найден .env.example для backend"
        exit 1
    }
}

# Frontend env
Write-Host "[3/7] Проверка frontend .env..."
$frontendEnv = Join-Path $FRONTEND_DIR ".env"
$frontendEnvExample = Join-Path $FRONTEND_DIR ".env.example"
if (!(Test-Path $frontendEnv)) {
    if (Test-Path $frontendEnvExample) {
        Copy-Item $frontendEnvExample $frontendEnv
        Write-Host "Создан $frontendEnv из .env.example"
    } else {
        Write-Host "Не найден .env.example для frontend"
        exit 1
    }
}

# Backend install + prisma
Write-Host "[4/7] Установка зависимостей backend..."
Set-Location $BACKEND_DIR
npm install --no-fund --no-audit

Write-Host "[5/7] Подготовка базы (Prisma)..."
npx prisma generate
npx prisma migrate dev --name init
npx prisma db seed

# Frontend install
Write-Host "[6/7] Установка зависимостей frontend..."
Set-Location $FRONTEND_DIR
npm install --no-fund --no-audit

# Start services
Write-Host "[7/7] Запуск сервисов..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$BACKEND_DIR'; npm run dev"
Start-Sleep -Seconds 3

Write-Host "`nBackend:  http://localhost:5001"
Write-Host "Frontend: http://localhost:5173"
Write-Host "Health:   http://localhost:5001/health"
Write-Host "`nТестовые аккаунты (seed):"
Write-Host "admin@taskmanager.com / password123"
Write-Host "manager@taskmanager.com / password123"
Write-Host "employee@taskmanager.com / password123"
Write-Host "finance@taskmanager.com / password123"
Write-Host "viewer@taskmanager.com / password123"
Write-Host ""

npm run dev
