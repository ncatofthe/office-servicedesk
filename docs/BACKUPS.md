# Backup и восстановление

Актуально на 2026-04-25.

## Что реализовано

- Ручной backup PostgreSQL через `pg_dump`.
- Ручное восстановление через `pg_restore`.
- Ежедневный планировщик backup PostgreSQL внутри backend-процесса.
- Ручной backup пользовательских файлов из `task-manager-backend/uploads`.
- Ручное восстановление файлового архива в `uploads` или во временную папку.
- Retention по умолчанию: 2 дня.
- Папка по умолчанию: `backups` в корне проекта.
- Каждый dump и каждый файловый архив сопровождается `.json` manifest-файлом.

## Структура backup

```text
backups/
  taskmanager-backup-YYYYMMDDTHHMMSSZ.dump
  taskmanager-backup-YYYYMMDDTHHMMSSZ.dump.json
  files/
    taskmanager-files-backup-YYYYMMDDTHHMMSSZ.tar.gz
    taskmanager-files-backup-YYYYMMDDTHHMMSSZ.tar.gz.json
```

DB backup остаётся совместим с текущими командами. Файловый backup добавлен отдельным контуром внутри той же корневой структуры.

## Требования

На сервере должны быть доступны CLI-утилиты PostgreSQL:

```bash
pg_dump --version
pg_restore --version
```

Для файлового backup на сервере должен быть доступен `tar`:

```bash
tar --version
```

`DATABASE_URL` берётся из `task-manager-backend/.env`. Если строка Prisma содержит `?schema=public`, backup-сервис автоматически убирает этот параметр для `pg_dump`/`pg_restore`.

## Env

```env
BACKUP_ENABLED=true
BACKUP_FILES_ENABLED=true
BACKUP_DIR=backups
BACKUP_RETENTION_DAYS=2
BACKUP_HOUR=3
BACKUP_MINUTE=0
```

`BACKUP_ENABLED=true` включает ежедневный scheduler PostgreSQL. `BACKUP_FILES_ENABLED=true` добавляет к тому же ежедневному запуску архив `uploads`. Ручные команды работают независимо от этих флагов.

Файловый backup использует тот же `BACKUP_DIR`, но складывает архивы в подпапку `files`.

## Команды

```bash
cd /Users/hatss/Documents/task_bogdan

npm --workspace task-manager-backend run backup:create
npm --workspace task-manager-backend run backup:list
npm --workspace task-manager-backend run backup:cleanup
npm --workspace task-manager-backend run backup:next-run
npm --workspace task-manager-backend run backup:files:create
npm --workspace task-manager-backend run backup:files:list
npm --workspace task-manager-backend run backup:files:cleanup
```

Восстановление БД является разрушительной операцией и требует явного подтверждения:

```bash
cd /Users/hatss/Documents/task_bogdan/task-manager-backend
npm run backup:restore -- taskmanager-backup-YYYYMMDDTHHMMSSZ.dump --yes
```

Можно передать абсолютный путь к `.dump` файлу.

Восстановление файлового архива во временную папку:

```bash
cd /Users/hatss/Documents/task_bogdan/task-manager-backend
npm run backup:files:restore -- taskmanager-files-backup-YYYYMMDDTHHMMSSZ.tar.gz /tmp/officesd-uploads-restore
```

Если нужно восстановить прямо в рабочий `uploads`, используйте явное подтверждение:

```bash
cd /Users/hatss/Documents/task_bogdan/task-manager-backend
npm run backup:files:restore -- taskmanager-files-backup-YYYYMMDDTHHMMSSZ.tar.gz /Users/hatss/Documents/task_bogdan/task-manager-backend/uploads --yes
```

## Как работает scheduler

При старте backend `src/server.js` вызывает `startBackupScheduler()`. Если `BACKUP_ENABLED` выключен, ничего не планируется.

Если `BACKUP_ENABLED=true`, backend создаёт следующий запуск на локальное время сервера из `BACKUP_HOUR` и `BACKUP_MINUTE`.

Scheduler всегда создаёт PostgreSQL backup и при `BACKUP_FILES_ENABLED=true` следом архивирует `uploads`. Ошибка файлового архива логируется отдельно и не удаляет уже созданный dump БД.

## Как восстановить оба контура

1. Остановить backend.
2. Восстановить БД:

```bash
cd /Users/hatss/Documents/task_bogdan/task-manager-backend
npm run backup:restore -- taskmanager-backup-YYYYMMDDTHHMMSSZ.dump --yes
```

3. Восстановить файловый архив:

```bash
cd /Users/hatss/Documents/task_bogdan/task-manager-backend
npm run backup:files:restore -- taskmanager-files-backup-YYYYMMDDTHHMMSSZ.tar.gz /Users/hatss/Documents/task_bogdan/task-manager-backend/uploads --yes
```

4. Запустить backend.
5. Прогнать smoke и проверить загрузку/скачивание вложений.

## Что проверять перед релизом

1. `backup:create` создаёт `.dump` и `.dump.json`.
2. `backup:list` показывает свежий backup.
3. `backup:files:create` создаёт `.tar.gz` и `.tar.gz.json`.
4. `backup:files:list` показывает свежий файловый backup.
5. `backup:cleanup` и `backup:files:cleanup` не падают.
6. `backup:next-run` показывает ожидаемое время scheduler.
7. Папка `backups` не лежит в публичной директории frontend.

## Ограничения

- Нет web-интерфейса для backup/restore.
- Нет загрузки backup через UI.
- Restore нужно выполнять вручную на сервере и только после остановки активной работы пользователей.
- Backup файлов рассчитан на локально-серверный сценарий и не делает off-site копии сам по себе.
