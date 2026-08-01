# Отделы, папки и команды

Актуально на 2026-05-15.

## Разделение понятий

- `Department` - старая организационная модель проекта.
- `TicketFolder` - новая папка ServiceDesk для очередей заявок.
- `SupportTeam` - команда исполнителей, которую можно привязать к папке.

## Как использовать сейчас

Для новых ServiceDesk сценариев использовать `TicketFolder`, а не `Department`. Frontend не должен отправлять `folderId` как `departmentId`.

`/api/departments` остаётся compatibility API для старых профилей пользователей, primary department membership и admin-операций вокруг оргструктуры. Это не целевая модель очередей заявок.

Canonical ServiceDesk API:

- `/api/servicedesk/folders`
- `/api/servicedesk/teams`
- `/api/servicedesk/admin/folders`
- `/api/servicedesk/admin/teams`

## Целевая модель

Папка определяет поток заявок, команда определяет исполнителей, типы и подтипы помогают маршрутизировать обращение.

## Пример

- Папка: `Склад и отгрузки`.
- Команда: `Складские исполнители`.
- Тип: `Отгрузка`.
- Подтип: `Ошибка в документах`.

## Runtime-правило

Folder/team permissions уже строятся через `SupportTeamMember` и `SupportTeamFolder`. `Department` не должен участвовать в новой логике доступа к заявкам, кроме мягкой совместимости старых профилей.
