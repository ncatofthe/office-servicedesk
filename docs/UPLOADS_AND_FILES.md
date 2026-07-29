# Вложения и файлы

Актуально на 2026-07-18.

## API

- `POST /api/files/:taskId` - загрузить файл к заявке.
- `GET /api/files/:taskId` - список файлов заявки.
- `GET /api/files/:id/download` - скачать файл.
- `DELETE /api/files/:id` - удалить файл.

## Хранение

Файлы лежат в `task-manager-backend/uploads`. В БД хранится запись `TaskAttachment` с именем и путём. Email-вложения из intake также сохраняются в эту папку и привязываются к созданной заявке.

Для production-ready эксплуатации добавлен отдельный backup этой папки через:

- `npm --workspace task-manager-backend run backup:files:create`
- `npm --workspace task-manager-backend run backup:files:list`
- `npm --workspace task-manager-backend run backup:files:cleanup`
- `npm --workspace task-manager-backend run backup:files:restore`

## Рабочая политика

По умолчанию один файл ограничен `50 MB` через `MAX_UPLOAD_SIZE_MB`. Разрешены основные
офисные форматы: изображения, PDF, TXT/CSV/JSON, Word, Excel, PowerPoint, ZIP/RAR/7z.
Список MIME-типов меняется через `ALLOWED_UPLOAD_MIME_TYPES` без правки кода.

Файлы не раздаются как публичная static-папка: скачивание проходит через авторизованный
endpoint с проверкой доступа к заявке. Для локального VM/server deployment каталог задаётся
абсолютным `UPLOADS_DIR` и включается в ежедневный файловый backup.

## Остаточные меры hardening

- Антивирусная проверка ClamAV перед окончательным сохранением.
- Логирование скачиваний.
- Периодическая очистка orphaned файлов обычных web-вложений.
