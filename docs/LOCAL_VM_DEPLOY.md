# Локальный офисный сервер: запуск Office ServiceDesk

Актуально на 2026-06-18.

Этот документ для первого запуска внутри компании без публичного домена. Система будет открываться с любого ПК в офисной сети по адресу вида `http://192.168.1.50` или `http://servicedesk.local`, если настроить локальное имя.

## 0. Что получится в итоге

Схема простая:

```text
ПК сотрудников в офисе
        |
        |  http://IP_СЕРВЕРА
        v
Nginx на локальной VM
        |-- отдаёт frontend из task-manager-frontend/dist
        |-- проксирует /api и /health в backend :5001
        v
Node.js backend + PostgreSQL на той же VM
```

## 1. Минимальные мощности VM

Для офиса 50-60 сотрудников на первый запуск:

- CPU: 2 ядра минимум, лучше 4.
- RAM: 4 GB минимум, лучше 8 GB.
- Disk: 40-60 GB SSD минимум.
- OS: Ubuntu Server 22.04/24.04 LTS.
- Network: статический IP в локальной сети, например `192.168.1.50`.

Если будут активно хранить вложения, диск лучше сразу 100 GB или отдельный диск под `/opt/officesd/backups` и uploads.

## 2. Что скачать и установить на VM

На чистой Ubuntu VM зайти по SSH и выполнить:

```bash
sudo apt update
sudo apt install -y curl git nginx postgresql postgresql-contrib ufw
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

Проверить версии:

```bash
node -v
npm -v
psql --version
nginx -v
```

## 3. Настроить доступ с офисных ПК

Лучший вариант: закрепить VM постоянный IP в роутере/DHCP, например `192.168.1.50`.

Проверка с любого ПК в сети:

```bash
ping 192.168.1.50
```

Если хотите красивое имя без покупки домена:

- В локальном DNS/роутере создать A-запись `servicedesk.local -> 192.168.1.50`.
- Если локального DNS нет, временно добавить запись в hosts-файл на нужных ПК:

Windows, файл `C:\Windows\System32\drivers\etc\hosts` от администратора:

```text
192.168.1.50 servicedesk.local
```

macOS/Linux, файл `/etc/hosts`:

```text
192.168.1.50 servicedesk.local
```

После этого портал будет открываться как `http://servicedesk.local`.

## 4. Создать сервисного пользователя и папки

```bash
sudo useradd --system --create-home --shell /bin/bash servicedesk || true
sudo mkdir -p /opt/officesd
sudo mkdir -p /opt/officesd/task-manager-backend/uploads
sudo mkdir -p /opt/officesd/backups
sudo chown -R servicedesk:servicedesk /opt/officesd
```

## 5. Скопировать проект на сервер

С Mac/рабочего ПК можно скопировать так, заменив `SERVER_IP` на IP VM:

```bash
rsync -av --delete \
  --exclude node_modules \
  --exclude .env \
  --exclude .env.* \
  --exclude backups \
  --exclude task-manager-backend/uploads \
  --exclude test-results \
  --exclude playwright-report \
  /Users/hatss/Documents/task_bogdan/ \
  servicedesk@SERVER_IP:/opt/officesd/
```

Если `servicedesk` не имеет SSH-доступа, копируйте под своим пользователем, а после копирования выполните на сервере:

```bash
sudo chown -R servicedesk:servicedesk /opt/officesd
```

## 6. Создать базу PostgreSQL

На сервере:

```bash
sudo -u postgres createuser servicedesk --pwprompt
sudo -u postgres createdb officesd --owner servicedesk
```

Проверить подключение, подставив пароль:

```bash
psql "postgresql://servicedesk:ВАШ_ПАРОЛЬ@127.0.0.1:5432/officesd?schema=public" -c "select 1;"
```

## 7. Установить зависимости проекта

```bash
cd /opt/officesd
sudo -u servicedesk npm ci
sudo -u servicedesk npm run build:contracts
```

Если `npm ci` ругается на права, проверить владельца:

```bash
sudo chown -R servicedesk:servicedesk /opt/officesd
```

## 8. Создать backend `.env`

```bash
cd /opt/officesd
sudo -u servicedesk cp deploy/local-vm/backend.env.example task-manager-backend/.env
sudo -u servicedesk nano task-manager-backend/.env
```

Обязательно заменить:

- `CHANGE_ME_DB_PASSWORD` на пароль PostgreSQL пользователя `servicedesk`.
- `CHANGE_ME_LONG_RANDOM_SECRET_40_PLUS_CHARS` на длинную случайную строку.
- `SERVER_IP` на IP VM, например `192.168.1.50`.

Пример важных строк:

```env
DATABASE_URL="postgresql://servicedesk:ВАШ_ПАРОЛЬ@127.0.0.1:5432/officesd?schema=public"
JWT_SECRET=очень_длинная_случайная_строка
CORS_ORIGINS=http://192.168.1.50,http://servicedesk.local
PORTAL_BASE_URL=http://192.168.1.50
TRUST_PROXY=loopback
RATE_LIMIT_MAX_REQUESTS=5000
AUTH_RATE_LIMIT_MAX_REQUESTS=100
UPLOADS_DIR=/opt/officesd/task-manager-backend/uploads
BACKUP_DIR=/opt/officesd/backups
BACKUP_ENABLED=true
BACKUP_FILES_ENABLED=true
```

`TRUST_PROXY=loopback` важен для установки через Nginx на той же VM: backend будет видеть реальный IP офисного ПК из `X-Forwarded-For`, а не считать весь офис одним клиентом `127.0.0.1`.

На первом запуске email лучше оставить выключенным:

```env
EMAIL_INTAKE_ENABLED=false
EMAIL_OUTBOUND_ENABLED=false
EMAIL_NOTIFICATIONS_ENABLED=false
EMAIL_OUTBOX_WORKER_ENABLED=false
```

## 9. Применить миграции и создать первого администратора

```bash
cd /opt/officesd
sudo -u servicedesk npm --workspace task-manager-backend run prisma:migrate:deploy
```

Создать первого администратора:

```bash
cd /opt/officesd
sudo -u servicedesk BOOTSTRAP_ADMIN_EMAIL=admin@company.local \
  BOOTSTRAP_ADMIN_NAME="Администратор ServiceDesk" \
  BOOTSTRAP_ADMIN_PASSWORD="ВРЕМЕННЫЙ_СЛОЖНЫЙ_ПАРОЛЬ" \
  npm --workspace task-manager-backend run prisma:bootstrap-admin
```

Важно: `prisma:seed` на рабочем стенде не нужен, он создаёт демо-пользователей.

## 10. Собрать frontend

```bash
cd /opt/officesd
sudo -u servicedesk npm --workspace task-manager-frontend run build
```

Frontend соберётся в:

```text
/opt/officesd/task-manager-frontend/dist
```

## 11. Настроить backend как systemd service

```bash
sudo cp /opt/officesd/deploy/local-vm/officesd-backend.service /etc/systemd/system/officesd-backend.service
sudo systemctl daemon-reload
sudo systemctl enable officesd-backend
sudo systemctl start officesd-backend
sudo systemctl status officesd-backend
```

Проверить backend:

```bash
curl -i http://127.0.0.1:5001/health
```

Логи backend:

```bash
journalctl -u officesd-backend -f
```

## 12. Настроить Nginx

```bash
sudo cp /opt/officesd/deploy/local-vm/nginx.officesd.local.conf /etc/nginx/sites-available/officesd
sudo ln -sf /etc/nginx/sites-available/officesd /etc/nginx/sites-enabled/officesd
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

Открыть firewall только для SSH и HTTP:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx HTTP'
sudo ufw --force enable
sudo ufw status
```

Проверить с сервера:

```bash
curl -I http://127.0.0.1/
curl -i http://127.0.0.1/health
```

Проверить с офисного ПК:

```text
http://192.168.1.50
```

или, если настроили имя:

```text
http://servicedesk.local
```

## 13. Первый вход

Открыть портал в браузере и войти администратором, которого создали в разделе 9.

Дальше в UI:

1. Создать/проверить папки заявок.
2. Создать исполнителей с ролью `Исполнитель`.
3. Создать заявщиков или разрешить регистрацию, если так задумано.
4. Проверить создание заявки заявщиком.
5. Проверить, что исполнитель видит заявку и может ответить.

## 14. Email через Яндекс включать позже

Когда веб уже работает, заполнить в `.env`:

```env
EMAIL_IMAP_USER=mailbox@company.ru
EMAIL_IMAP_PASSWORD=пароль_приложения
EMAIL_SMTP_USER=mailbox@company.ru
EMAIL_SMTP_PASSWORD=пароль_приложения
EMAIL_FROM_ADDRESS=mailbox@company.ru
```

Проверить без отправки писем:

```bash
cd /opt/officesd
sudo -u servicedesk npm --workspace task-manager-backend run email:yandex:check -- --connect-imap --verify-smtp
```

Только после успешной проверки можно по одному включать:

```env
EMAIL_OUTBOUND_ENABLED=true
EMAIL_NOTIFICATIONS_ENABLED=true
EMAIL_OUTBOX_WORKER_ENABLED=true
EMAIL_INTAKE_ENABLED=true
```

После изменения `.env` перезапускать backend:

```bash
sudo systemctl restart officesd-backend
```

## 15. Backup на каждый день

Добавить cron для пользователя `servicedesk`:

```bash
sudo crontab -u servicedesk -e
```

Вставить:

```cron
0 3 * * * cd /opt/officesd && npm --workspace task-manager-backend run backup:create && npm --workspace task-manager-backend run backup:files:create && npm --workspace task-manager-backend run backup:cleanup && npm --workspace task-manager-backend run backup:files:cleanup >> /opt/officesd/backups/backup.log 2>&1
```

Проверить вручную:

```bash
cd /opt/officesd
sudo -u servicedesk npm --workspace task-manager-backend run backup:create
sudo -u servicedesk npm --workspace task-manager-backend run backup:files:create
sudo -u servicedesk npm --workspace task-manager-backend run backup:list
sudo -u servicedesk npm --workspace task-manager-backend run backup:files:list
```

## 16. Быстрая проверка после установки

```bash
curl -i http://127.0.0.1/health
sudo systemctl status officesd-backend
sudo nginx -t
cd /opt/officesd
sudo -u servicedesk npm --workspace task-manager-backend run prisma:validate
sudo -u servicedesk npm --workspace task-manager-frontend run build
```

В браузере проверить:

- вход администратора;
- создание заявки;
- открытие карточки заявки;
- публичный комментарий;
- внутренняя заметка не видна заявщику;
- вложение прикрепляется и скачивается;
- `/admin` открывается администратору.

## 17. Как обновлять проект на сервере

1. Сделать backup.
2. Скопировать новый код в `/opt/officesd`.
3. Выполнить:

```bash
cd /opt/officesd
sudo -u servicedesk npm ci
sudo -u servicedesk npm run build:contracts
sudo -u servicedesk npm --workspace task-manager-backend run prisma:migrate:deploy
sudo -u servicedesk npm --workspace task-manager-frontend run build
sudo systemctl restart officesd-backend
sudo systemctl reload nginx
curl -i http://127.0.0.1/health
```

## 18. Частые проблемы

### Сайт не открывается с ПК

Проверить:

```bash
ip addr
sudo ufw status
sudo systemctl status nginx
```

Убедиться, что ПК и VM в одной сети и VM имеет статический IP.

### Backend не стартует

```bash
journalctl -u officesd-backend -n 100 --no-pager
```

Чаще всего причина: неправильный `DATABASE_URL`, не применены миграции или неверные права на `/opt/officesd`.

### Login не работает

Проверить, что создан `ADMIN` через `prisma:bootstrap-admin`, и что frontend ходит в тот же backend:

```bash
curl -i http://127.0.0.1/health
```

### Вложения не загружаются

Проверить права:

```bash
sudo chown -R servicedesk:servicedesk /opt/officesd/task-manager-backend/uploads
```

### После смены `.env` ничего не изменилось

Нужно перезапустить backend:

```bash
sudo systemctl restart officesd-backend
```

## 19. Что не делать на первом запуске

- Не запускать `prisma:seed` на рабочей БД.
- Не включать email intake/outbound до проверки Yandex.
- Не открывать сервер наружу в интернет без HTTPS и нормального firewall.
- Не хранить backup в публичной frontend-папке.
- Не удалять папку `uploads` и `backups` при обновлении.
