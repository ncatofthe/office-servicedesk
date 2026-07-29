import { expect, test, type Page } from '@playwright/test';

const timestamp = Date.now();
const requesterName = `Smoke Requester ${timestamp}`;
const requesterEmail = `smoke.requester.${timestamp}@example.com`;
const requesterPassword = 'Password123!';
const ticketTitle = `Smoke ticket ${timestamp}`;
const ticketDescription = `Smoke ticket created at ${new Date(timestamp).toISOString()}`;
const publicCommentText = `Публичный комментарий smoke ${timestamp}`;
const internalNoteText = `Внутренняя заметка smoke ${timestamp}`;
const privateTemplateTitle = `Smoke private template ${timestamp}`;
const privateTemplateTitleEdited = `Smoke private template edited ${timestamp}`;
const privateTemplateComment = `Комментарий из private шаблона ${timestamp}`;
const sharedTemplateTitle = `Smoke shared template ${timestamp}`;
const sharedTemplateEmailText = `Email reply из shared шаблона ${timestamp}`;
const deleteTemplateTitle = `Smoke delete template ${timestamp}`;
const managedRequesterName = `Managed Requester ${timestamp}`;
const managedRequesterEmail = `managed.requester.${timestamp}@example.com`;
const managedRequesterPassword = 'Temporary123!';

let createdTicketNumber = '';

const loginAs = async (page: Page, email: string, password: string) => {
  await page.goto('/login');
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill(password);
  await page.getByTestId('login-submit').click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Главная' })).toBeVisible();
};

const openCreatedTicketFromTickets = async (page: Page) => {
  const createdRow = page.getByTestId('task-inbox-row').filter({ hasText: ticketTitle }).first();
  await expect(createdRow).toBeVisible();
  await createdRow.getByRole('button', { name: 'Открыть' }).click();
  await expect(page.getByTestId('task-details-modal')).toBeVisible();
  await expect(page.getByTestId('task-details-ticket-number')).toHaveText(createdTicketNumber);
};

const ensureTaskDetailsOpenFromQueue = async (page: Page) => {
  if (await page.getByTestId('task-details-modal').count()) {
    return;
  }

  const createdCard = page.getByTestId('task-card').filter({ hasText: ticketTitle }).first();
  await expect(createdCard).toBeVisible();
  await createdCard.click();
  await expect(page.getByTestId('task-details-modal')).toBeVisible();
  await expect(page.getByTestId('task-details-ticket-number')).toHaveText(createdTicketNumber);
};

test.describe.serial('Office ServiceDesk smoke @smoke', () => {
  test('requester can register, login, create a ticket and see it in /tickets', async ({ page }) => {
    await page.goto('/register');
    await page.getByTestId('register-name').fill(requesterName);
    await page.getByTestId('register-email').fill(requesterEmail);
    await page.getByTestId('register-password').fill(requesterPassword);
    await page.getByTestId('register-submit').click();

    await expect(page).toHaveURL(/\/login$/);

    await loginAs(page, requesterEmail, requesterPassword);
    await expect(page.getByText('Заявщик')).toBeVisible();
    await expect(page.getByTestId('notification-bell')).toBeVisible();

    await page.goto('/tickets');
    await expect(page.getByRole('heading', { name: 'Заявки' })).toBeVisible();

    await page.getByTestId('open-create-ticket').click();
    await expect(page.getByTestId('create-ticket-modal')).toBeVisible();
    await expect(page.getByTestId('ticket-form-priority')).toHaveValue('MEDIUM');

    await page.getByTestId('ticket-form-title').fill(ticketTitle);
    await page.getByTestId('ticket-form-description').fill(ticketDescription);
    await page.getByTestId('ticket-form-folder').selectOption({ label: 'IT и доступы' });
    await page.getByTestId('ticket-form-priority').selectOption({ label: 'Высокий' });
    await page.getByTestId('ticket-form-type').selectOption({ label: 'Доступы и аккаунты' });
    await page.getByTestId('ticket-form-subtype').selectOption({ label: 'Сброс пароля' });
    await page.getByTestId('ticket-form-entity').selectOption({ label: 'Запрос' });
    await page.getByTestId('submit-create-ticket').click();

    await expect(page.getByTestId('ticket-create-success')).toContainText('Заявка создана.');

    const createdRow = page.getByTestId('task-inbox-row').filter({ hasText: ticketTitle }).first();
    await expect(createdRow).toBeVisible();
    await expect(page.getByTestId('ticket-pagination')).toBeVisible();
    await expect(page.getByTestId('ticket-page-size')).toHaveValue('25');
    await expect(page.getByTestId('ticket-pagination-range')).toContainText('из');

    await page.getByTestId('ticket-search').fill(ticketTitle);
    await expect(page.getByTestId('task-inbox-row')).toHaveCount(1);
    await expect(page.getByTestId('task-inbox-row').first()).toContainText(ticketTitle);
    await page.getByTestId('ticket-search').fill('');

    createdTicketNumber = ((await createdRow.textContent()) || '').match(/#\d+/)?.[0] || '';
    expect(createdTicketNumber).toMatch(/^#\d+$/);

    await createdRow.getByRole('button', { name: 'Открыть' }).click();
    await expect(page.getByTestId('task-details-modal')).toBeVisible();
    await expect(page.getByTestId('task-details-ticket-number')).toHaveText(createdTicketNumber);
    await expect(page.getByTestId('task-details-current-status')).toHaveText('Необработано');
    await expect(page.getByRole('link', { name: 'Шаблоны ответов' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Отчёты' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Финансы' })).toHaveCount(0);
  });

  test('agent manages canned replies, leaves internal notes and sees timeline updates', async ({ page }) => {
    expect(createdTicketNumber).toMatch(/^#\d+$/);

    await loginAs(page, 'employee@taskmanager.com', 'password123');

    await expect(page.getByRole('link', { name: 'Шаблоны ответов' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Отчёты' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Финансы' })).toHaveCount(0);
    await expect(page.getByRole('banner').getByText('Исполнитель')).toBeVisible();
    await expect(page.getByTestId('notification-bell')).toBeVisible();

    await page.goto('/tickets');
    await expect(page.getByTestId('ticket-pagination')).toBeVisible();
    const createdInboxRow = page.getByTestId('task-inbox-row').filter({ hasText: ticketTitle }).first();
    await expect(createdInboxRow).toBeVisible();
    await page.route('**/api/tasks/*/assignees', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'Access denied' }) });
        return;
      }
      await route.continue();
    });
    await createdInboxRow.getByTestId('task-quick-assign').last().click();
    await expect(page.getByTestId('task-action-error')).toContainText('Недостаточно прав');
    await page.unroute('**/api/tasks/*/assignees');

    await page.getByTestId('notification-bell').click();
    await expect(page.getByTestId('notifications-dropdown')).toBeVisible();
    const notificationDropdownText = await page.getByTestId('notifications-dropdown').textContent();
    expect(
      (notificationDropdownText || '').includes('Уведомления') ||
      (notificationDropdownText || '').includes('Центр уведомлений пока недоступен.')
    ).toBeTruthy();

    await page.goto('/reports');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { name: 'Главная' })).toBeVisible();

    await page.goto('/canned-replies');
    await expect(page.getByTestId('canned-replies-page')).toBeVisible();

    await page.getByTestId('canned-reply-create').click();
    await expect(page.getByTestId('canned-reply-form')).toBeVisible();
    await page.getByTestId('canned-reply-form-title').fill(privateTemplateTitle);
    await page.getByTestId('canned-reply-form-category').fill('Smoke');
    await page.getByTestId('canned-reply-form-visibility').selectOption('PRIVATE');
    await page.getByTestId('canned-reply-form-body').fill('Первичный текст private шаблона');
    await page.getByTestId('canned-reply-save').click();
    await expect(page.getByText('Шаблон ответа создан.')).toBeVisible();
    await expect(page.getByTestId('canned-reply-card').filter({ hasText: privateTemplateTitle })).toHaveCount(1);

    await page.getByTestId('canned-reply-create').click();
    await expect(page.getByTestId('canned-reply-form')).toBeVisible();
    await page.getByTestId('canned-reply-form-title').fill(sharedTemplateTitle);
    await page.getByTestId('canned-reply-form-category').fill('Smoke');
    await page.getByTestId('canned-reply-form-visibility').selectOption('SHARED');
    await page.getByTestId('canned-reply-form-body').fill('Первичный текст shared шаблона');
    await page.getByTestId('canned-reply-save').click();
    await expect(page.getByText('Шаблон ответа создан.')).toBeVisible();
    await expect(page.getByTestId('canned-reply-card').filter({ hasText: sharedTemplateTitle })).toHaveCount(1);

    await page.getByTestId('canned-reply-create').click();
    await expect(page.getByTestId('canned-reply-form')).toBeVisible();
    await page.getByTestId('canned-reply-form-title').fill(deleteTemplateTitle);
    await page.getByTestId('canned-reply-form-category').fill('Smoke');
    await page.getByTestId('canned-reply-form-visibility').selectOption('PRIVATE');
    await page.getByTestId('canned-reply-form-body').fill('Временный шаблон на удаление');
    await page.getByTestId('canned-reply-save').click();
    await expect(page.getByText('Шаблон ответа создан.')).toBeVisible();

    await page.getByTestId('canned-reply-search').fill(privateTemplateTitle);
    await expect(page.getByTestId('canned-reply-card')).toHaveCount(1);
    await expect(page.getByTestId('canned-reply-card').first()).toContainText(privateTemplateTitle);

    await page.getByTestId('canned-reply-card').first().click();
    await page.getByTestId('canned-reply-edit').click();
    await expect(page.getByTestId('canned-reply-form')).toBeVisible();
    await page.getByTestId('canned-reply-form-title').fill(privateTemplateTitleEdited);
    await page.getByTestId('canned-reply-form-body').fill(privateTemplateComment);
    await page.getByTestId('canned-reply-save').click();
    await expect(page.getByText('Шаблон ответа обновлён.')).toBeVisible();
    await page.getByTestId('canned-reply-search').fill('');
    await expect(page.getByTestId('canned-reply-card').filter({ hasText: privateTemplateTitleEdited })).toHaveCount(1);

    await page.getByTestId('canned-reply-filter-visibility').selectOption('PRIVATE');
    await expect(page.getByTestId('canned-reply-card').filter({ hasText: privateTemplateTitleEdited })).toHaveCount(1);
    await expect(page.getByTestId('canned-reply-card').filter({ hasText: sharedTemplateTitle })).toHaveCount(0);

    await page.getByTestId('canned-reply-filter-visibility').selectOption('SHARED');
    await expect(page.getByTestId('canned-reply-card').filter({ hasText: sharedTemplateTitle })).toHaveCount(1);

    await page.getByTestId('canned-reply-filter-visibility').selectOption('all');
    await page.getByTestId('canned-reply-search').fill(sharedTemplateTitle);
    await expect(page.getByTestId('canned-reply-card')).toHaveCount(1);
    await page.getByTestId('canned-reply-card').first().click();
    await page.getByTestId('canned-reply-toggle').click();
    await expect(page.getByText('Шаблон ответа отключён.')).toBeVisible();
    await expect(
      page.getByTestId('canned-reply-card').filter({ hasText: sharedTemplateTitle }).getByText('Отключён'),
    ).toBeVisible();

    await page.getByTestId('canned-reply-filter-activity').selectOption('disabled');
    await expect(page.getByTestId('canned-reply-card').filter({ hasText: sharedTemplateTitle })).toHaveCount(1);

    await page.getByTestId('canned-reply-toggle').click();
    await expect(page.getByText('Шаблон ответа включён.')).toBeVisible();
    await page.getByTestId('canned-reply-filter-activity').selectOption('active');
    await expect(page.getByTestId('canned-reply-card').filter({ hasText: sharedTemplateTitle })).toHaveCount(1);

    await page.getByTestId('canned-reply-filter-activity').selectOption('all');
    await page.getByTestId('canned-reply-search').fill(deleteTemplateTitle);
    await expect(page.getByTestId('canned-reply-card')).toHaveCount(1);
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByTestId('canned-reply-card').first().click();
    await page.getByTestId('canned-reply-delete').click();
    await expect(page.getByText('Шаблон ответа удалён.')).toBeVisible();
    await expect(page.getByTestId('canned-reply-search')).toHaveValue(deleteTemplateTitle);
    await expect(page.getByTestId('canned-reply-card').filter({ hasText: deleteTemplateTitle })).toHaveCount(0);

    await page.goto('/queue');
    await expect(page.getByRole('heading', { name: 'Очередь заявок' })).toBeVisible();

    await expect(page.getByTestId('task-card').filter({ hasText: ticketTitle })).toHaveCount(1);

    const createdCard = page.getByTestId('task-card').filter({ hasText: ticketTitle }).first();
    await createdCard.click();

    await expect(page.getByTestId('task-details-modal')).toBeVisible();
    await expect(page.getByTestId('task-details-ticket-number')).toHaveText(createdTicketNumber);
    await expect(page.getByTestId('task-timeline')).toBeVisible();

    await page.getByTestId('comment-input').fill(publicCommentText);
    await page.getByTestId('comment-submit').click();
    await expect(page.getByTestId('comments-list')).toContainText(publicCommentText);
    await expect(page.getByTestId('task-timeline')).toContainText('Комментарий');

    await page.getByTestId('internal-note-selector').selectOption('INTERNAL');
    await page.getByTestId('comment-input').fill(internalNoteText);
    await page.getByTestId('comment-submit').click();
    await expect(page.getByTestId('comments-list')).toContainText(internalNoteText);
    await expect(page.getByTestId('task-timeline')).toContainText('Внутренняя заметка');

    await page.getByPlaceholder('Найти шаблон по названию, тексту или категории').fill(privateTemplateTitleEdited);
    await expect(page.getByTestId('canned-reply-picker').getByTestId('canned-reply-card').filter({ hasText: privateTemplateTitleEdited })).toHaveCount(1);
    await page.getByTestId('canned-reply-picker').getByTestId('canned-reply-card').filter({ hasText: privateTemplateTitleEdited }).first().click();
    await page.getByTestId('canned-reply-apply-mode').selectOption('COMMENT');
    await page.getByTestId('canned-reply-body-override').fill(privateTemplateComment);
    await page.getByTestId('canned-reply-apply').click();
    await expect(page.getByTestId('comments-list')).toContainText(privateTemplateComment);
    await expect(page.getByTestId('task-timeline')).toContainText('Шаблон ответа');

    await ensureTaskDetailsOpenFromQueue(page);
    await page.getByPlaceholder('Найти шаблон по названию, тексту или категории').fill(privateTemplateTitleEdited);
    await expect(page.getByTestId('canned-reply-picker').getByTestId('canned-reply-card').filter({ hasText: privateTemplateTitleEdited })).toHaveCount(1);
    await page.getByTestId('canned-reply-picker').getByTestId('canned-reply-card').filter({ hasText: privateTemplateTitleEdited }).first().click();
    await page.getByTestId('canned-reply-apply-mode').selectOption('EMAIL_REPLY');
    await page.getByTestId('canned-reply-body-override').fill(sharedTemplateEmailText);
    await page.getByTestId('canned-reply-apply').click();
    const modalText = await page.getByTestId('task-details-modal').textContent();
    expect(modalText || '').toContain('Шаблон применён');
    if ((modalText || '').includes('outbound email выключен')) {
      expect(modalText || '').toContain('Письмо не отправлено реально');
    }
    await expect(page.getByTestId('task-email-thread')).toBeVisible();
    const emailThreadText = await page.getByTestId('task-email-thread').textContent();
    expect(emailThreadText || '').toContain('Email-переписка');
    if ((modalText || '').includes('outbound email выключен')) {
      expect(emailThreadText || '').toContain('Тестовый режим');
    }

    await ensureTaskDetailsOpenFromQueue(page);
    await page.getByTestId('task-status-action-IN_PROGRESS').first().click();
    await expect(page.getByTestId('task-details-current-status')).toHaveText('В процессе');
    await expect(page.getByTestId('task-status-action-DONE').first()).toBeVisible();
    await expect(page.getByTestId('task-timeline')).toContainText('Статус изменён');
  });

  test('requester sees only public replies and has no access to templates UI', async ({ page }) => {
    await loginAs(page, requesterEmail, requesterPassword);

    await expect(page.getByRole('link', { name: 'Шаблоны ответов' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Отчёты' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Финансы' })).toHaveCount(0);

    await page.goto('/canned-replies');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { name: 'Главная' })).toBeVisible();

    await page.goto('/tickets');
    await openCreatedTicketFromTickets(page);
    await expect(page.getByTestId('comments-list')).toContainText(publicCommentText);
    await expect(page.getByTestId('comments-list')).toContainText(privateTemplateComment);
    await expect(page.getByTestId('comments-list')).not.toContainText(internalNoteText);
    await expect(page.getByTestId('task-timeline')).toContainText('Комментарий');
    await expect(page.getByTestId('task-timeline')).not.toContainText('Внутренняя заметка');
    await expect(page.getByTestId('task-details-modal')).not.toContainText(internalNoteText);
    await expect(page.getByTestId('task-email-thread')).toBeVisible();
    await expect(page.getByTestId('task-email-thread')).not.toContainText('Попыток отправки');
    await expect(page.getByTestId('task-email-thread')).not.toContainText('Следующий повтор');

    await page.goto('/admin');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { name: 'Главная' })).toBeVisible();
  });

  test('mobile: requester opens ticket details and sees stable layout', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAs(page, requesterEmail, requesterPassword);

    await page.goto('/tickets');
    await openCreatedTicketFromTickets(page);

    await expect(page.getByTestId('task-details-modal')).toBeVisible();
    await expect(page.getByTestId('comments-list')).toBeVisible();
    await expect(page.getByTestId('task-timeline')).toBeVisible();
  });

  test('viewer does not see templates UI', async ({ page }) => {
    await loginAs(page, 'viewer@taskmanager.com', 'password123');
    await expect(page.getByRole('link', { name: 'Шаблоны ответов' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Отчёты' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Финансы' })).toHaveCount(0);

    await page.goto('/reports');
    await expect(page.getByRole('heading', { name: 'Отчёты' })).toBeVisible();

    await page.goto('/canned-replies');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { name: 'Главная' })).toBeVisible();
  });

  test('admin can open admin pages and knowledge list', async ({ page }) => {
    await page.setViewportSize({ width: 1274, height: 900 });
    const productSettings = {
      portalName: 'Office ServiceDesk',
      companyName: '',
      welcomeMessage: null,
      locale: 'ru-RU',
      timezone: 'Europe/Moscow',
      defaultPriority: 'MEDIUM',
      defaultFolderId: null,
      defaultFolder: null,
    };
    await page.route('**/api/servicedesk/product-settings', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(productSettings) });
    });
    await page.route('**/api/servicedesk/admin/product-settings', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...productSettings,
          id: 'default',
          createdAt: new Date(timestamp).toISOString(),
          updatedAt: new Date(timestamp).toISOString(),
        }),
      });
    });
    await loginAs(page, 'admin@taskmanager.com', 'password123');
    await expect(page.getByRole('link', { name: 'Отчёты' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Финансы' })).toHaveCount(0);
    await expect(page.getByText('Администратор')).toBeVisible();
    await expect(page.getByTestId('notification-bell')).toBeVisible();
    await expect(page.getByTestId('layout-portal-name')).toHaveText('Office ServiceDesk');
    await expect(page.getByTestId('layout-company-name')).toHaveCount(0);
    await expect(page.getByText('Office ServiceDesk', { exact: true })).toHaveCount(1);
    await expect(page).toHaveTitle('Office ServiceDesk');
    expect(await page.locator('html').getAttribute('lang')).toBe('ru-RU');
    const usersNavigationBox = await page.getByRole('link', { name: 'Пользователи' }).boundingBox();
    expect(usersNavigationBox).not.toBeNull();
    expect((usersNavigationBox?.x || 0) + (usersNavigationBox?.width || 0)).toBeLessThanOrEqual(1274);
    expect(await page.evaluate(() => document.body.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();

    await page.getByTestId('notification-bell').click();
    await expect(page.getByTestId('notifications-dropdown')).toBeVisible();

    const paginationRequests: string[] = [];
    const paginationTasks = Array.from({ length: 30 }, (_, index) => ({
      id: `pagination-task-${index + 1}`,
      ticketNumber: 9000 + index,
      displayNumber: `#${9000 + index}`,
      title: `Pagination ticket ${index + 1}`,
      description: 'Проверка серверной пагинации',
      status: 'NEW',
      priority: 'MEDIUM',
      authorId: 'pagination-author',
      author: { id: 'pagination-author', name: 'Pagination User', email: 'pagination@example.com', role: 'REQUESTER', isActive: true },
      assignees: [],
      createdAt: new Date(timestamp - index * 1000).toISOString(),
      updatedAt: new Date(timestamp - index * 1000).toISOString(),
    }));
    await page.route('**/api/tasks?*', async (route) => {
      const url = new URL(route.request().url());
      const limit = Number(url.searchParams.get('limit') || 25);
      const offset = Number(url.searchParams.get('offset') || 0);
      paginationRequests.push(url.search);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ tasks: paginationTasks.slice(offset, offset + limit), total: paginationTasks.length, limit, offset }),
      });
    });
    await page.goto('/tickets');
    await expect(page.getByTestId('ticket-pagination-range')).toHaveText('Показаны 1–25 из 30');
    await page.getByTestId('ticket-pagination-next').click();
    await expect(page.getByTestId('ticket-pagination-range')).toHaveText('Показаны 26–30 из 30');
    await expect(page.getByTestId('task-inbox-row')).toHaveCount(5);
    expect(paginationRequests.some((query) => query.includes('offset=25') && query.includes('sortBy=updated'))).toBeTruthy();
    await page.unroute('**/api/tasks?*');

    await page.goto('/reports');
    await expect(page.getByRole('heading', { name: 'Отчёты' })).toBeVisible();

    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Настройки' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Компания и портал', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('admin-product-settings')).toBeVisible();
    await expect(page.getByTestId('product-settings-portal-name')).toHaveValue('Office ServiceDesk');
    await expect(page.getByTestId('product-settings-default-priority')).toHaveValue('MEDIUM');
    await expect(page.getByTestId('product-settings-save')).toBeEnabled();
    for (const tabName of ['Папки', 'Типы', 'Подтипы', 'Классы', 'Команды и доступы']) {
      await expect(page.getByRole('tab', { name: tabName, exact: true })).toBeVisible();
    }
    const adminTabList = page.getByRole('tablist', { name: 'Разделы' });
    expect(await adminTabList.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBeTruthy();
    await page.getByRole('tab', { name: 'Папки', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Добавить' })).toBeVisible();
    await page.getByTestId('admin-directory-add').click();
    await expect(page.getByTestId('admin-directory-modal')).toContainText('Новая папка заявок');
    await page.getByTestId('admin-directory-modal').getByRole('button', { name: 'Отмена' }).click();
    await page.getByRole('tab', { name: 'Команды и доступы', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Добавить' })).toBeVisible();
    await page.getByRole('button', { name: 'Настроить доступы команды Операционная поддержка' }).click();
    const teamAccessDialog = page.getByRole('dialog', { name: 'Доступ команды и участники' });
    await expect(teamAccessDialog).toBeVisible();
    await expect(teamAccessDialog.getByRole('option', { name: 'Eve Viewer · Наблюдатель' })).toHaveCount(0);
    await expect(teamAccessDialog.getByRole('option', { name: 'Olga Requester · Заявщик' })).toHaveCount(0);
    await teamAccessDialog.getByRole('button', { name: 'Закрыть' }).click();
    await page.getByRole('tab', { name: 'Почта' }).click();
    await expect(page.getByTestId('admin-email-outbox')).toBeVisible();
    await expect(page.getByTestId('admin-email-outbox-summary')).toBeVisible();
    await expect(page.getByLabel('Статус')).toBeVisible();
    await expect(page.getByLabel('Внутренний ID заявки')).toBeVisible();
    await expect(page.getByLabel('Лимит')).toBeVisible();
    const healthText = await page.getByTestId('admin-email-health').textContent();
    expect((healthText || '').includes('Диагностика email пока недоступна.') || (healthText || '').includes('Отправка писем')).toBeTruthy();
    const outboxText = await page.getByTestId('admin-email-outbox').textContent();
    expect(outboxText || '').toContain('Почта и очередь отправки');
    expect(outboxText || '').not.toContain('undefined');

    let realFreshdeskPullCalled = false;
    await page.route('**/api/servicedesk/admin/freshdesk-import/source-health', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ configured: true, domain: 'company.freshdesk.com', downloadAttachmentsEnabled: true }),
      });
    });
    await page.route('**/api/servicedesk/admin/freshdesk-import/pull/dry-run', async (route) => {
      const payload = route.request().postDataJSON() as { maxTickets?: number; updatedSince?: string; downloadAttachments?: boolean };
      expect(payload.maxTickets).toBe(20);
      expect(payload.downloadAttachments).toBeFalsy();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          run: {
            id: `fd-pull-dry-${timestamp}`,
            source: 'FRESHDESK_API',
            status: 'DRY_RUN',
            dryRun: true,
            createdAt: new Date(timestamp).toISOString(),
          },
          summary: { total: 20, created: 17, updated: 2, skipped: 1, errors: 0, comments: 34, attachments: 3, users: 12 },
          errors: [],
        }),
      });
    });
    await page.route('**/api/servicedesk/admin/freshdesk-import/pull', async (route) => {
      realFreshdeskPullCalled = true;
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Real import must not run in smoke' }) });
    });

    await page.getByRole('tab', { name: 'Импорт Freshdesk' }).click();
    await expect(page.getByTestId('admin-freshdesk-import')).toBeVisible();
    await expect(page.getByTestId('freshdesk-import-method-direct')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('freshdesk-source-configured')).toContainText('company.freshdesk.com');
    await expect(page.getByTestId('freshdesk-pull-run')).toBeDisabled();
    await expect(page.getByTestId('freshdesk-pull-verification-hint')).toBeVisible();
    await expect(page.getByTestId('freshdesk-direct-import').locator('input[type="password"]')).toHaveCount(0);
    await expect(page.getByTestId('freshdesk-direct-import')).not.toContainText(/API[-_ ]?key/i);
    await page.getByTestId('freshdesk-pull-dry-run').click();
    await expect(page.getByTestId('freshdesk-import-result')).toContainText('Результат проверки');
    await expect(page.getByTestId('freshdesk-import-result')).toContainText('17');
    await expect(page.getByTestId('freshdesk-import-result')).toContainText('Комментарии');
    await expect(page.getByTestId('freshdesk-pull-run')).toBeEnabled();
    await page.getByTestId('freshdesk-pull-attachments').check();
    await expect(page.getByTestId('freshdesk-pull-run')).toBeDisabled();
    await page.getByTestId('freshdesk-pull-attachments').uncheck();
    await expect(page.getByTestId('freshdesk-pull-run')).toBeEnabled();
    expect(realFreshdeskPullCalled).toBeFalsy();

    await page.getByTestId('freshdesk-import-method-file').click();
    await expect(page.getByTestId('freshdesk-import-file')).toBeVisible();
    await expect(page.getByTestId('freshdesk-import-dry-run')).toBeVisible();
    await expect(page.getByTestId('freshdesk-import-run')).toBeVisible();
    await page.getByTestId('freshdesk-import-file').setInputFiles({
      name: 'smoke-freshdesk-import.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({
        tickets: [
          {
            id: `fd-smoke-${timestamp}`,
            externalNumber: `FD-SMOKE-${timestamp}`,
            subject: `Freshdesk dry-run smoke ${timestamp}`,
            description: 'Проверка staging UI без реального импорта.',
            status: 'open',
            priority: 'high',
            requester: {
              email: `freshdesk.requester.${timestamp}@example.com`,
              name: 'Freshdesk Заявщик',
            },
            agent: {
              email: 'employee@taskmanager.com',
              name: 'Employee User',
            },
            comments: [
              {
                id: `fd-comment-${timestamp}`,
                body: 'Публичный комментарий из Freshdesk export.',
                private: false,
              },
            ],
          },
        ],
      })),
    });
    await expect(page.getByTestId('freshdesk-import-file-summary')).toContainText('Загружено заявок: 1');
    await expect(page.getByTestId('freshdesk-import-dry-run')).toBeEnabled();
    await page.getByTestId('freshdesk-import-dry-run').click();
    await expect(page.getByTestId('freshdesk-import-result')).toContainText('Результат проверки');
    await expect(page.getByTestId('freshdesk-import-result')).toContainText('Всего');

    await page.goto('/team');
    await expect(page.getByRole('heading', { name: 'Пользователи' })).toBeVisible();
    await expect(page.getByTestId('team-users-section')).toBeVisible();
    await page.getByRole('tab', { name: 'Отделы компании' }).click();
    await expect(page.getByTestId('team-departments-section')).toBeVisible();
    await page.getByRole('tab', { name: 'Сотрудники и роли' }).click();
    await expect(page.getByText('Admin User').first()).toBeVisible();
    const archivedViewerCard = page.getByTestId('team-user-card').filter({ hasText: 'Eve Viewer' });
    await expect(archivedViewerCard).toHaveCount(1);
    await archivedViewerCard.click();
    await expect(page.getByTestId('team-user-role-select')).toHaveValue('VIEWER');
    await expect(page.getByTestId('team-user-role-select')).toContainText('Наблюдатель (архивная роль)');
    await page.getByRole('dialog', { name: 'Eve Viewer' }).getByRole('button', { name: 'Закрыть' }).click();
    await page.getByTestId('team-create-user').click();
    await page.getByTestId('team-create-name').fill(managedRequesterName);
    await page.getByTestId('team-create-email').fill(managedRequesterEmail);
    await page.getByTestId('team-create-password').fill(managedRequesterPassword);
    await page.getByTestId('team-create-role').selectOption('REQUESTER');
    await page.getByTestId('team-create-position').fill('Тестовый заявитель');
    await page.getByTestId('team-create-submit').click();
    await expect(page.getByText(`Учётная запись «${managedRequesterName}» создана.`)).toBeVisible();

    await page.getByTestId('team-user-search').fill(managedRequesterEmail);
    const managedUserCard = page.getByTestId('team-user-card').filter({ hasText: managedRequesterName });
    await expect(managedUserCard).toHaveCount(1);
    await managedUserCard.click();
    await expect(page.getByTestId('team-user-status-badge')).toHaveText('Активен');

    let temporaryPasswordUpdated = false;
    await page.route('**/api/users/*/password', async (route) => {
      expect(route.request().method()).toBe('PATCH');
      const payload = route.request().postDataJSON() as { password?: string };
      expect(payload.password?.length).toBeGreaterThanOrEqual(10);
      temporaryPasswordUpdated = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Временный пароль установлен. Все активные сессии отозваны.' }),
      });
    });
    await page.getByTestId('team-user-set-password').click();
    await expect(page.getByTestId('team-password-modal')).toBeVisible();
    await expect(page.getByTestId('team-password-warning')).toContainText('сессии будут отозваны');
    await page.getByTestId('team-password-input').fill('Temporary123!');
    await page.getByTestId('team-password-confirm').fill('Temporary123!');
    await page.getByTestId('team-password-submit').click();
    await expect(page.getByTestId('team-password-modal')).toHaveCount(0);
    await expect(page.getByText('Временный пароль установлен. Все активные сессии отозваны.')).toBeVisible();
    expect(temporaryPasswordUpdated).toBeTruthy();
    await expect(page.getByText('Temporary123!')).toHaveCount(0);

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByTestId('team-user-toggle-status').click();
    await expect(page.getByTestId('team-user-status-badge')).toHaveText('Отключён');
    await page.getByRole('button', { name: 'Закрыть' }).click();

    await page.getByTestId('team-access-filter').selectOption('inactive');
    await expect(managedUserCard).toHaveCount(1);
    await managedUserCard.click();
    await page.getByTestId('team-user-toggle-status').click();
    await expect(page.getByTestId('team-user-status-badge')).toHaveText('Активен');
    await page.getByRole('button', { name: 'Закрыть' }).click();

    await page.goto('/knowledge');
    await expect(page.getByRole('heading', { name: 'База знаний' })).toBeVisible();
    await expect(page.getByTestId('knowledge-article-list')).toBeVisible();
    await expect(page.getByTestId('knowledge-article-card').first()).toBeVisible();
    await expect(page.getByTestId('knowledge-article-list')).toContainText('Сброс пароля в Office ServiceDesk');
  });
});
