# Staging launch pack

Актуально на 2026-06-11.

Цель документа - провести первый тестовый запуск Office ServiceDesk как замену Freshdesk: поднять стенд, проверить Yandex email, импортировать малый экспорт Freshdesk и пройти UAT тремя ролями.

Этот launch pack не про разработку новых функций. Он про доказательство, что текущий release candidate можно безопасно показать и дать людям потестировать.

## 0. Что считаем успешным стендом

Стенд считается успешным, если:

- backend отвечает `200` на `/health`;
- frontend открывается по staging URL;
- `ADMIN` может войти и открыть `/admin`;
- `REQUESTER` может создать заявку через `/tickets`;
- `AGENT` видит заявку, меняет статус и отвечает публичным комментарием;
- `REQUESTER` видит публичный ответ и не видит внутреннюю заметку;
- Yandex IMAP/SMTP credentials проходят безопасную проверку;
- Freshdesk export на 20-50 заявках проходит dry-run без критичных ошибок;
- backup-директории и uploads-директория существуют и доступны backend-пользователю;
- finance/review runtime не активен.

## 1. Что подготовить заранее

Нужно собрать:

- адрес staging frontend, например `https://servicedesk-staging.company.local`;
- адрес staging backend, например `https://servicedesk-api-staging.company.local`;
- PostgreSQL user/password/db;
- длинный `JWT_SECRET`;
- Yandex mailbox для ServiceDesk;
- Yandex IMAP/SMTP пароль приложения или разрешённый пароль почтового ящика;
- Freshdesk export на 20-50 заявках в JSON или CSV;
- список 3 тестовых людей: администратор, исполнитель, заявщик.

Рекомендуемые серверные пути:

```text
/opt/officesd
/opt/officesd/task-manager-backend/uploads
/opt/officesd/backups
```

## 2. Подготовить сервер

Пример для Linux-сервера:

```bash
sudo mkdir -p /opt/officesd
sudo mkdir -p /opt/officesd/task-manager-backend/uploads
sudo mkdir -p /opt/officesd/backups
sudo chown -R servicedesk:servicedesk /opt/officesd
```

Если сервисный пользователь ещё не создан:

```bash
sudo useradd --system --create-home --shell /bin/bash servicedesk
```

Проверить Node.js и PostgreSQL:

```bash
node -v
npm -v
psql --version
pg_dump --version
```

## 3. Подготовить PostgreSQL

Пример:

```bash
sudo -u postgres createuser servicedesk --pwprompt
sudo -u postgres createdb servicedesk_staging --owner servicedesk
```

Проверить подключение:

```bash
psql "postgresql://servicedesk:<password>@127.0.0.1:5432/servicedesk_staging?schema=public" -c "select 1;"
```

## 4. Развернуть код

Вариант через копирование или git зависит от сервера. В результате код должен лежать в:

```text
/opt/officesd
```

Дальше команды выполняются из корня проекта:

```bash
cd /opt/officesd
npm install
npm run build:contracts
```

## 5. Заполнить backend env

Создать `.env`:

```bash
cp task-manager-backend/.env.production.example task-manager-backend/.env
```

Минимальный staging env:

```env
DATABASE_URL="postgresql://servicedesk:<password>@127.0.0.1:5432/servicedesk_staging?schema=public"
PORT=5001
JWT_SECRET="<long-random-secret>"
CORS_ORIGINS=https://servicedesk-staging.company.local
CORS_ORIGIN=
PORTAL_BASE_URL=https://servicedesk-staging.company.local
UPLOADS_DIR=/opt/officesd/task-manager-backend/uploads
BACKUP_DIR=/opt/officesd/backups
BACKUP_ENABLED=true
BACKUP_RETENTION_DAYS=2
BACKUP_HOUR=3
BACKUP_MINUTE=0
```

Yandex env:

```env
EMAIL_IMAP_HOST=imap.yandex.ru
EMAIL_IMAP_PORT=993
EMAIL_IMAP_SECURE=true
EMAIL_IMAP_USER=<mailbox@company.ru>
EMAIL_IMAP_PASSWORD=<secret>
EMAIL_SMTP_HOST=smtp.yandex.ru
EMAIL_SMTP_PORT=465
EMAIL_SMTP_SECURE=true
EMAIL_SMTP_USER=<mailbox@company.ru>
EMAIL_SMTP_PASSWORD=<secret>
EMAIL_FROM_ADDRESS=<mailbox@company.ru>
EMAIL_FROM_NAME=Office ServiceDesk
```

Безопасные флаги первого старта:

```env
EMAIL_INTAKE_ENABLED=false
EMAIL_OUTBOUND_ENABLED=false
EMAIL_NOTIFICATIONS_ENABLED=false
EMAIL_OUTBOX_WORKER_ENABLED=false
```

Не включать реальные письма до проверки из раздела 10.

## 6. Применить миграции и создать администратора

```bash
cd /opt/officesd
npm --workspace task-manager-backend run prisma:migrate:deploy
```

Создать первого `ADMIN`:

```bash
BOOTSTRAP_ADMIN_EMAIL=admin@company.ru \
BOOTSTRAP_ADMIN_NAME="Администратор ServiceDesk" \
BOOTSTRAP_ADMIN_PASSWORD="<temporary-strong-password>" \
npm --workspace task-manager-backend run prisma:bootstrap-admin
```

Если `ADMIN` уже есть, команда безопасно остановится и не создаст второго первичного администратора.

## 7. Собрать frontend

```bash
cd /opt/officesd
npm --workspace task-manager-frontend run build
```

Для быстрого внутреннего стенда можно временно запустить preview:

```bash
npm --workspace task-manager-frontend run preview -- --host 0.0.0.0 --port 4173
```

Для более аккуратного стенда лучше раздавать `task-manager-frontend/dist` через Nginx/Caddy.

## 8. Запустить backend

Разовый запуск для проверки:

```bash
cd /opt/officesd
npm --workspace task-manager-backend run start
```

Проверить health:

```bash
curl -i http://localhost:5001/health
```

Ожидаемо:

```text
HTTP/1.1 200 OK
{"status":"OK","message":"Server and DB connected"}
```

## 9. Рекомендуемый systemd service

Пример `/etc/systemd/system/officesd-backend.service`:

```ini
[Unit]
Description=Office ServiceDesk Backend
After=network.target postgresql.service

[Service]
Type=simple
WorkingDirectory=/opt/officesd
EnvironmentFile=/opt/officesd/task-manager-backend/.env
ExecStart=/usr/bin/npm --workspace task-manager-backend run start
Restart=always
RestartSec=5
User=servicedesk
Group=servicedesk

[Install]
WantedBy=multi-user.target
```

Включить:

```bash
sudo systemctl daemon-reload
sudo systemctl enable officesd-backend
sudo systemctl start officesd-backend
sudo systemctl status officesd-backend
```

Логи:

```bash
journalctl -u officesd-backend -f
```

## 10. Проверить Yandex email

Сначала только env/readiness:

```bash
cd /opt/officesd
npm --workspace task-manager-backend run email:yandex:check
```

Потом сетевая проверка IMAP/SMTP без отправки писем:

```bash
npm --workspace task-manager-backend run email:yandex:check -- --connect-imap --verify-smtp
```

Ожидаемо:

- пароли не печатаются;
- логины маскируются;
- IMAP login проходит;
- SMTP verify проходит;
- `sendMail` не вызывается.

Если проверка не прошла, не включать `EMAIL_OUTBOUND_ENABLED=true` и `EMAIL_INTAKE_ENABLED=true`.

## 11. Безопасно включить email

Порядок включения:

1. Оставить все email-флаги выключенными и проверить UI/API.
2. Проверить `email:yandex:check -- --connect-imap --verify-smtp`.
3. Включить только dry-run сценарии через UI: canned reply `EMAIL_REPLY` должен создать outbox `DRY_RUN`.
4. Проверить `/admin` -> `Email-очередь`.
5. Включить исходящие письма:

```env
EMAIL_OUTBOUND_ENABLED=true
```

6. Отправить один тестовый email-ответ по тестовой заявке.
7. Проверить outbox: статус должен стать `SENT` или понятный `RETRY_PENDING/FAILED`.
8. Только после этого включать уведомления:

```env
EMAIL_NOTIFICATIONS_ENABLED=true
```

9. Worker включать последним:

```env
EMAIL_OUTBOX_WORKER_ENABLED=true
```

10. Inbound включать после отдельного теста mailbox:

```env
EMAIL_INTAKE_ENABLED=true
```

Если что-то пошло не так, вернуть все email-флаги в `false`, перезапустить backend и смотреть outbox/history без риска повторной массовой отправки.

## 12. Проверить Freshdesk import

Сначала sample-файлы:

```bash
cd /opt/officesd
npm --workspace task-manager-backend run import:freshdesk -- --file samples/freshdesk-import-sample.json --dry-run
npm --workspace task-manager-backend run import:freshdesk -- --file samples/freshdesk-import-sample.csv --dry-run
```

Потом малый реальный экспорт:

```bash
npm --workspace task-manager-backend run import:freshdesk -- --file /path/to/freshdesk-small-export.json --dry-run
```

Проверить:

- `total`;
- `created`;
- `updated/skipped`, если есть;
- `errors`;
- старые номера заявок `externalNumber`;
- requester email;
- `PUBLIC` comments;
- `INTERNAL` notes;
- attachment metadata.

Реальный import запускать только после успешного dry-run:

```bash
npm --workspace task-manager-backend run import:freshdesk -- --file /path/to/freshdesk-small-export.json
```

После этого повторить тот же import ещё раз. Дубли создаваться не должны.

Полный Freshdesk import не запускать до успешного малого импорта на 20-50 заявках.

## 13. Проверить backup и uploads

```bash
cd /opt/officesd
npm --workspace task-manager-backend run backup:create
npm --workspace task-manager-backend run backup:list
npm --workspace task-manager-backend run backup:files:create
npm --workspace task-manager-backend run backup:files:list
```

Проверить, что файлы появились в:

```text
/opt/officesd/backups
/opt/officesd/backups/files
```

## 14. Smoke перед UAT

Backend:

```bash
cd /opt/officesd
npm run build:contracts
npm --workspace task-manager-backend run prisma:validate
npm --workspace task-manager-backend run prisma:migrate:deploy
npm --workspace task-manager-backend run smoke:servicedesk
npm --workspace task-manager-backend run email:smoke
npm --workspace task-manager-backend run email:reply-smoke
npm --workspace task-manager-backend run email:outbox:retry
```

Frontend:

```bash
cd /opt/officesd
npm --workspace task-manager-frontend run build
```

Если staging запускается в том же окружении, можно дополнительно пройти e2e:

```bash
npm run test:e2e:smoke
```

## 15. UAT: сценарий заявщика

Роль: `REQUESTER`.

Проверить:

- вход/регистрация;
- создание заявки с обязательными полями `Название` и `Описание`;
- отображение номера заявки;
- отображение своей заявки в `/tickets`;
- открытие карточки;
- публичный комментарий исполнителя виден;
- внутренняя заметка не видна;
- технические email-поля не видны;
- мобильный просмотр карточки не разваливается.

Критерий успеха: заявщик понимает, где создать обращение и где читать ответ.

## 16. UAT: сценарий исполнителя

Роль: `AGENT`.

Проверить:

- вход;
- видит `/tickets` и очередь доступных папок;
- открывает заявку;
- меняет статус `Необработано -> В процессе -> Закрыто`;
- пишет публичный комментарий;
- пишет внутреннюю заметку;
- применяет шаблон ответа;
- видит email thread;
- видит timeline;
- не видит чужие недоступные папки, если такие есть.

Критерий успеха: исполнитель может обработать заявку без объяснений разработчика.

## 17. UAT: сценарий администратора

Роль: `ADMIN`.

Проверить:

- вход;
- `/admin`;
- вкладки `Папки`, `Типы`, `Подтипы`, `Сущности`, `Команды`;
- добавление/редактирование тестовой папки или команды;
- пользователи и роли;
- `Email-очередь`;
- email health;
- Freshdesk import dry-run через UI;
- история запусков импорта.

Критерий успеха: администратор может настроить базовую структуру без доступа к коду.

## 18. Stop conditions

Остановить staging/UAT и не идти дальше, если:

- `/health` не отвечает `200`;
- миграции не применяются;
- login `ADMIN` не работает;
- `REQUESTER` видит internal notes;
- `REQUESTER` видит чужие заявки;
- `AGENT` видит явно чужие недоступные папки;
- Yandex SMTP verify не проходит, но кто-то предлагает включить real outbound;
- Freshdesk dry-run показывает массовые ошибки данных;
- backup создать нельзя;
- uploads-директория недоступна backend-процессу.

## 19. Что не делать на первом стенде

- Не включать полный Freshdesk import до малого успешного импорта.
- Не включать массовые email notifications до проверки одного исходящего письма.
- Не включать email intake на рабочем mailbox без теста.
- Не развивать SLA/reports перед первым UAT.
- Не возвращать finance/review runtime.
- Не менять auth flow.
- Не удалять исторические миграции или legacy-таблицы.

## 20. Короткая команда запуска

Если всё уже настроено:

```bash
cd /opt/officesd
npm install
npm run build:contracts
npm --workspace task-manager-backend run prisma:migrate:deploy
npm --workspace task-manager-frontend run build
sudo systemctl restart officesd-backend
curl -i http://localhost:5001/health
npm --workspace task-manager-backend run email:yandex:check -- --connect-imap --verify-smtp
npm --workspace task-manager-backend run import:freshdesk -- --file samples/freshdesk-import-sample.json --dry-run
```

После этого открыть frontend staging URL и пройти UAT из разделов 15-17.
