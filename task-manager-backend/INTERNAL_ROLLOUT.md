# Internal rollout

Актуально на 2026-04-23.

## Цель rollout

Поднять ServiceDesk на локальном сервере компании и дать первой группе пользователей заменить Freshdesk-подобный поток заявок.

## Подготовка сервера

- Установить Node.js и PostgreSQL.
- Создать БД и пользователя.
- Заполнить backend `.env`.
- Применить миграции.
- Выполнить seed или вручную создать справочники.

## Проверки

```bash
npm --workspace task-manager-backend run prisma:validate
npm --workspace task-manager-backend run smoke:servicedesk
npm --workspace task-manager-backend run smoke:merge-approval
npm --workspace task-manager-backend run email:smoke
npm --workspace task-manager-backend run email:reply-smoke
npm --workspace task-manager-backend run knowledge:smoke
npm --workspace task-manager-backend run backup:create
npm --workspace task-manager-backend run backup:list
npm --workspace task-manager-frontend run build
```

## Первый пилот

- 1 администратор портала.
- 2 системных администратора.
- 3 аналитика 1С.
- 1 представитель склада.
- Несколько обычных заявителей.

## Перед включением пользователей

- Проверить CORS.
- Проверить вложения.
- Проверить создание заявки USER.
- Проверить админку справочников.
- Проверить merge UI после выравнивания frontend contract.
- Проверить ручной backup и включить `BACKUP_ENABLED=true` на сервере.
- Если нужен email-пилот, проверить `email:sync`, реальный SMTP reply на корпоративном Яндекс-ящике и включить `EMAIL_INTAKE_ENABLED=true`.
- Проверить `/knowledge` и вставку ссылки на статью в комментарий заявки.

## После пилота

- Собрать 10-20 реальных заявок.
- Уточнить папки и типы.
- Наполнить базу знаний реальными инструкциями.
- Добавить журнал исходящих email, retry и UI-кнопку email-ответа.
- Добавить отдельный backup пользовательских файлов из `task-manager-backend/uploads`.
