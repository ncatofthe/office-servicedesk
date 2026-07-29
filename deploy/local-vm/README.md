# Локальный офисный сервер

Эта папка содержит минимальный набор шаблонов для первого запуска Office ServiceDesk на внутренней виртуальной машине компании.

## Что здесь лежит

- `backend.env.example` - пример backend `.env`; скопировать в `/opt/officesd/task-manager-backend/.env` и заменить `SERVER_IP`, пароли и секреты.
- `officesd-backend.service` - systemd service для постоянного запуска backend.
- `nginx.officesd.local.conf` - Nginx-конфиг: раздаёт frontend и проксирует `/api` в backend.

## Короткий порядок установки

1. Подготовить VM с Ubuntu/Debian, статическим IP и доступом из офисной сети.
2. Установить `node`, `npm`, `postgresql`, `nginx`, `git`.
3. Разместить проект в `/opt/officesd`.
4. Создать PostgreSQL базу и пользователя.
5. Скопировать `backend.env.example` в `/opt/officesd/task-manager-backend/.env`.
6. Собрать contracts/frontend и применить backend migrations.
7. Скопировать `officesd-backend.service` в `/etc/systemd/system/`.
8. Скопировать `nginx.officesd.local.conf` в `/etc/nginx/sites-available/officesd`.
9. Запустить `systemctl enable --now officesd-backend` и перезагрузить Nginx.
10. Открыть портал с офисного ПК по `http://SERVER_IP` или локальному имени вроде `http://servicedesk.local`.

Полная пошаговая инструкция: `docs/LOCAL_VM_DEPLOY.md`.
