# E2E Smoke

Актуально на 2026-07-19.

## Что это

Playwright smoke suite для Office ServiceDesk, который проходит живые ключевые сценарии без моков:

- регистрация заявителя;
- вход администратора, заявителя и агента;
- вход наблюдателя;
- проверка, что `REQUESTER`, `AGENT`, `ADMIN` и `VIEWER` не видят `Отчёты` в основной навигации;
- проверка прямого доступа к `/reports` для `ADMIN` и `VIEWER`;
- создание заявки заявителем;
- проверка своей заявки на `/tickets` в Freshdesk-like inbox/list;
- открытие очереди агента на `/queue`;
- проверка, что агент видит доступные заявки по текущей folder/team модели;
- открытие деталей заявки и смена статуса агентом;
- создание личного и общего шаблона ответа;
- поиск, редактирование, отключение/включение и удаление шаблона;
- проверка, что удалённый canned reply исчезает из текущего списка;
- применение шаблона в заявке как `COMMENT`;
- применение шаблона в заявке как `EMAIL_REPLY`;
- проверка dry-run сообщения для email reply, если outbound email выключен;
- проверка блока `Email-переписка` в карточке заявки после `EMAIL_REPLY`;
- добавление публичного комментария и внутренней заметки;
- проверка, что requester не видит internal note;
- проверка, что requester видит безопасную email-переписку без технических полей повтора;
- проверка блока timeline и обновления истории после комментария и смены статуса;
- проверка bell и dropdown уведомлений для `ADMIN` и `AGENT`;
- проверка, что `REQUESTER` и `VIEWER` не видят UI шаблонов ответов;
- проверка admin-вкладки `Почта` в `/admin` (summary + фильтры + отсутствие сломанного `undefined` в адресах);
- проверка адаптивной шапки и вкладок настроек при ширине `1274px` без горизонтального переполнения и обрезания `Пользователи`;
- проверка первой admin-вкладки `Компания и портал` без PATCH/загрязнения БД: загрузка формы, priority по умолчанию и доступность сохранения;
- проверка ProductSettings branding: `Office ServiceDesk` не дублируется при пустом `companyName`, обновляются `document.title` и `html[lang]`;
- проверка, что форма новой заявки явно показывает backend `defaultPriority` (`MEDIUM` в test settings);
- проверка раздельных разделов `/team`: `Сотрудники и роли` и `Отделы компании`;
- проверка, что существующая архивная роль `VIEWER` не подменяется на `AGENT` в карточке пользователя;
- проверка admin-вкладки `Импорт Freshdesk`: замок real pull до dry-run, mock безопасного прямого dry-run на 20 заявок и сохранённый file JSON dry-run;
- проверка отсутствия API key/секретных полей в браузере и запрета настоящего Freshdesk pull в smoke;
- установка временного пароля тестовому requester через mock `PATCH /users/:id/password`, проверка предупреждения об отзыве сессий и очистки пароля из UI;
- проверка health panel или мягкого fallback-сообщения `Диагностика email пока недоступна`;
- отдельная mobile-проверка: requester открывает карточку заявки в узком viewport (390x844), модалка/переписка/timeline доступны и не ломают layout;
- открытие `/admin` и `/team` администратором;
- открытие `/knowledge` и загрузка списка статей.

## Что нужно для запуска

- Установленные зависимости в root:

```bash
cd /Users/hatss/Documents/task_bogdan
npm install
```

- Установленный браузер Playwright:

```bash
npm run test:e2e:smoke:install
```

Или эквивалентно:

```bash
npx playwright install chromium
```

- Доступная выделенная PostgreSQL база для smoke/test.

Smoke использует `task-manager-backend/.env.test`, а не обычный `.env`.
Файл должен указывать на отдельную БД и не совпадать с dev-базой.

Минимально:

```env
DATABASE_URL="postgresql://taskmanager_app:taskmanager_app@localhost:5432/taskmanager_test?schema=public"
JWT_SECRET=taskmanager_test_jwt_secret
```

Если файла нет, скопируйте шаблон:

```bash
cp /Users/hatss/Documents/task_bogdan/task-manager-backend/.env.test.example /Users/hatss/Documents/task_bogdan/task-manager-backend/.env.test
```

## Как запускать

Обычный smoke-запуск:

```bash
cd /Users/hatss/Documents/task_bogdan
npm run test:e2e:smoke
```

Запуск с видимым браузером:

```bash
cd /Users/hatss/Documents/task_bogdan
npm run test:e2e:smoke:headed
```

## Что поднимается автоматически

Перед тестами ничего вручную запускать не нужно, кроме PostgreSQL.

`npm run test:e2e:smoke` сам делает следующее:

1. Проверяет безопасность `task-manager-backend/.env.test`.
2. Поднимает backend на `http://127.0.0.1:5002` через `npm --workspace task-manager-backend run start:e2e`.
3. Для backend применяет миграции, пересобирает contracts и прогоняет `prisma:seed` на test DB.
4. Поднимает frontend на `http://127.0.0.1:4173` через `npm --workspace task-manager-frontend run dev:e2e`.
5. Запускает Playwright smoke suite.

## Данные и seed

Smoke опирается на `prisma:seed` и дополнительно создаёт свои данные во время прогона.

Seed гарантирует:

- demo users:
  - `admin@taskmanager.com / password123`
  - `employee@taskmanager.com / password123`
  - `manager@taskmanager.com / password123`
  - `support@taskmanager.com / password123`
  - `requester@taskmanager.com / password123`
- ServiceDesk folders/types/subtypes/entities/teams;
- стартовые заявки для проверки access-модели;
- опубликованные knowledge articles для `/knowledge`.
- пользователя-наблюдателя `viewer@taskmanager.com / password123`.

Во время smoke:

- регистрируется новый уникальный requester;
- создаётся новая уникальная заявка в папке `IT и доступы`;
- эта заявка затем проверяется в `/tickets` и `/queue`;
- на этой же заявке прогоняются canned replies, public/internal comments и timeline assertions.

## Ручной debug

Если нужно смотреть стенд руками, можно поднимать части отдельно:

```bash
cd /Users/hatss/Documents/task_bogdan
npm --workspace task-manager-backend run start:e2e
```

Во втором терминале:

```bash
cd /Users/hatss/Documents/task_bogdan
npm --workspace task-manager-frontend run dev:e2e
```

Тогда UI будет на `http://127.0.0.1:4173`, API на `http://127.0.0.1:5002`.

## Артефакты

- `test-results/` — trace/video/screenshot при падениях.
- `playwright-report/` — HTML report.

Для просмотра trace:

```bash
npx playwright show-trace /Users/hatss/Documents/task_bogdan/test-results/<trace-folder>/trace.zip
```

## Ограничения текущего smoke

Сейчас smoke всё ещё не покрывает:

- частичный отказ загрузки вложений после успешного создания заявки (для состояния добавлен стабильный `ticket-create-partial-success` hook);
- merge/link/union сценарии;
- close approval flow;
- CRUD knowledge/admin dictionaries;
- глубокие негативные кейсы RBAC на каждом экране;
- все варианты outbound email, если SMTP реально включён и нужно проверять фактическую отправку.

При этом smoke проверяет базовый контракт пагинации inbox (`25` по умолчанию, диапазон записей), серверный поиск по теме и видимое сообщение при отказе быстрого назначения исполнителя.
Admin-сценарий дополнительно проверяет вторую страницу при серверной сортировке `updated`, создание `REQUESTER`, установку временного пароля и безопасное отключение/повторное включение учётной записи без удаления.

## Текущий статус

На 2026-06-10 smoke проходит на актуальной связке backend/frontend:

- backend `start:e2e` применяет миграции и seed без ошибки `notification.title`;
- frontend открывает Freshdesk-like inbox;
- admin-вкладка `Импорт Freshdesk` проверяется в обоих режимах. Прямой endpoint перехватывается Playwright и возвращает безопасный dry-run; настоящий `pull` не вызывается. Затем smoke загружает JSON и запускает существующий file dry-run без создания импортированных заявок.
