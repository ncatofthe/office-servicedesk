# Перенос данных из Freshdesk

## Рекомендуемый способ: Freshdesk API v2

1. В Freshdesk откройте профиль администратора: **Profile settings -> Your API key**.
2. На backend-сервере задайте `FRESHDESK_DOMAIN=company.freshdesk.com` и `FRESHDESK_API_KEY`. Ключ нельзя добавлять во frontend, git или логи.
3. При необходимости задайте `FRESHDESK_DEFAULT_FOLDER_ID`. Сначала importer ищет активную папку с именем Freshdesk group, затем использует fallback. Папки автоматически не создаются.
4. Начните с проверки 20-50 заявок:

```bash
npm --workspace task-manager-backend run import:freshdesk:api -- --dry-run --max-tickets 20
npm --workspace task-manager-backend run import:freshdesk:api -- --max-tickets 20
```

5. Проверьте номера, даты, заявителей, исполнителей, группы, публичные ответы и внутренние заметки.
6. Повторите ту же команду: дубли не должны появиться. По умолчанию существующая импортированная заявка пропускается и локальные изменения не перезаписываются.
7. Выполните полный перенос:

```bash
npm --workspace task-manager-backend run import:freshdesk:api -- --updated-since 1970-01-01T00:00:00.000Z
```

CLI не ограничен 100 заявками. `--max-tickets N` задаёт лимит. HTTP pull ограничен 100 заявками для пилота.

## HTTP API (только ADMIN)

- `GET /api/servicedesk/admin/freshdesk-import/source-health`
- `POST /api/servicedesk/admin/freshdesk-import/pull/dry-run`
- `POST /api/servicedesk/admin/freshdesk-import/pull`
- `GET /api/servicedesk/admin/freshdesk-import/runs`
- `GET /api/servicedesk/admin/freshdesk-import/runs/:id`

Pull body: `{ "updatedSince": "2024-01-01T00:00:00.000Z", "maxTickets": 50, "downloadAttachments": false }`. API key никогда не возвращается.

## Что переносится

- заявки и старые номера;
- numeric statuses `2 -> NEW`, `3 -> IN_PROGRESS`, `4/5 -> DONE`;
- priorities `1..4`;
- исходные даты заявок, комментариев и закрытия;
- requester, responder, group, tags, custom fields и source metadata;
- все conversations отдельным запросом;
- канал: Freshdesk source `1` становится `EMAIL`, остальные `WEB`;
- папка по имени группы или явному fallback;
- опционально бинарные вложения.

## Вложения и безопасность

JSON/CSV import всегда metadata-only. Скачивание возможно только для URL, полученных в текущем authenticated API pull, и только при `FRESHDESK_DOWNLOAD_ATTACHMENTS_ENABLED=true` плюс `--download-attachments`/`downloadAttachments=true`.

Downloader требует HTTPS, блокирует localhost/private/link-local IP, проверяет каждый redirect, timeout и фактический размер потока (`FRESHDESK_ATTACHMENT_MAX_BYTES`). Ошибка одного файла переводит запуск в `PARTIAL`, но не удаляет заявку. Повторный запуск использует external attachment reference и не создаёт дубль.

## Конкурентность

Одновременно разрешён только один real import/pull. Второй получает HTTP `409`/ошибку `FRESHDESK_IMPORT_CONFLICT`. Dry-run не занимает real-import lock. Протухший lock очищается после `FRESHDESK_IMPORT_LOCK_TTL_MS`.

## Файловый импорт (совместимость)

```bash
npm --workspace task-manager-backend run import:freshdesk -- --file samples/freshdesk-import-sample.json --dry-run
npm --workspace task-manager-backend run import:freshdesk -- --file samples/freshdesk-import-sample.json
```

JSON/CSV остаётся идемпотентным и не скачивает произвольные URL.
