import { expect, test, type Locator, type Page } from '@playwright/test';

type ViewportCase = {
  name: string;
  width: number;
  height: number;
};

type RouteCase = {
  path: string;
  ready: (page: Page) => Locator;
  critical: (page: Page) => Locator[];
};

const viewports: ViewportCase[] = [
  { name: 'desktop-1920', width: 1920, height: 1080 },
  { name: 'desktop-1536', width: 1536, height: 864 },
  { name: 'compact-desktop-1274', width: 1274, height: 800 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'mobile-390', width: 390, height: 844 },
];

const routeCases: RouteCase[] = [
  {
    path: '/tickets',
    ready: (page) => page.getByRole('heading', { name: 'Заявки' }),
    critical: (page) => [
      page.getByTestId('open-create-ticket'),
      page.getByTestId('ticket-search'),
      page.getByTestId('task-inbox-table'),
      page.getByTestId('ticket-pagination'),
    ],
  },
  {
    path: '/queue',
    ready: (page) => page.getByRole('heading', { name: 'Очередь заявок' }),
    critical: (page) => [page.getByTestId('task-card').first()],
  },
  {
    path: '/admin',
    ready: (page) => page.getByTestId('service-desk-admin-page'),
    critical: (page) => [
      page.getByRole('tablist').first(),
      page.getByTestId('admin-product-settings'),
      page.getByTestId('product-settings-form'),
      page.getByTestId('product-settings-save'),
    ],
  },
  {
    path: '/team',
    ready: (page) => page.getByRole('heading', { name: 'Пользователи' }),
    critical: (page) => [
      page.getByRole('tablist').first(),
      page.getByTestId('team-users-section'),
      page.getByTestId('team-user-search'),
      page.getByTestId('team-access-filter'),
    ],
  },
  {
    path: '/knowledge',
    ready: (page) => page.getByRole('heading', { name: 'База знаний' }),
    critical: (page) => [page.getByTestId('knowledge-article-list')],
  },
  {
    path: '/canned-replies',
    ready: (page) => page.getByTestId('canned-replies-page'),
    critical: (page) => [
      page.getByTestId('canned-reply-create'),
      page.getByTestId('canned-reply-search'),
      page.getByTestId('canned-reply-filter-category'),
      page.getByTestId('canned-reply-filter-visibility'),
      page.getByTestId('canned-reply-filter-activity'),
    ],
  },
];

const loginAsAdmin = async (page: Page) => {
  await page.goto('/login');
  await page.getByTestId('login-email').fill('admin@taskmanager.com');
  await page.getByTestId('login-password').fill('password123');
  await page.getByTestId('login-submit').click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Главная' })).toBeVisible();
};

const assertNoPageHorizontalOverflow = async (page: Page, context: string) => {
  const result = await page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const viewportWidth = window.innerWidth;
    const scrollWidth = Math.max(root.scrollWidth, body.scrollWidth);

    const offenders = Array.from(document.querySelectorAll<HTMLElement>('body *'))
      .filter((element) => {
        const style = window.getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || style.position === 'fixed') {
          return false;
        }
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && (rect.left < -1 || rect.right > viewportWidth + 1);
      })
      .slice(0, 8)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          testId: element.dataset.testid || '',
          className: typeof element.className === 'string' ? element.className.slice(0, 120) : '',
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        };
      });

    return {
      viewportWidth,
      scrollWidth,
      offenders,
    };
  });

  expect.soft(
    result.scrollWidth,
    `${context}: page horizontal overflow; viewport=${result.viewportWidth}, scrollWidth=${result.scrollWidth}, offenders=${JSON.stringify(result.offenders)}`,
  ).toBeLessThanOrEqual(result.viewportWidth + 1);
};

const assertLocatorInsideViewport = async (locator: Locator, context: string) => {
  if (await locator.count() === 0) {
    expect.soft(await locator.count(), `${context}: critical element is missing`).toBeGreaterThan(0);
    return;
  }

  const target = locator.first();
  await expect.soft(target, `${context}: critical element is not visible`).toBeVisible();
  if (!await target.isVisible()) return;

  const metrics = await target.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      scrollWidth: (element as HTMLElement).scrollWidth,
      clientWidth: (element as HTMLElement).clientWidth,
      scrollHeight: (element as HTMLElement).scrollHeight,
      clientHeight: (element as HTMLElement).clientHeight,
    };
  });

  expect.soft(metrics.width, `${context}: critical element has zero width`).toBeGreaterThan(0);
  expect.soft(metrics.height, `${context}: critical element has zero height`).toBeGreaterThan(0);
  expect.soft(metrics.left, `${context}: critical element starts left of viewport`).toBeGreaterThanOrEqual(-1);
  expect.soft(metrics.right, `${context}: critical element ends right of viewport`).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect.soft(
    metrics.scrollWidth,
    `${context}: critical element clips content horizontally (${metrics.scrollWidth}px > ${metrics.clientWidth}px)`,
  ).toBeLessThanOrEqual(metrics.clientWidth + 1);
};

const assertNoBrokenSingleWordButtons = async (page: Page, context: string) => {
  const brokenButtons = await page.locator('button:visible').evaluateAll((buttons) => buttons.flatMap((button) => {
    const text = (button.textContent || '').replace(/\s+/g, ' ').trim();
    if (!text || text.includes(' ') || text.length < 3) return [];

    const textNodes: Text[] = [];
    const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
    let currentNode = walker.nextNode();
    while (currentNode) {
      if (currentNode.textContent?.trim()) textNodes.push(currentNode as Text);
      currentNode = walker.nextNode();
    }

    const lineTops = textNodes.flatMap((textNode) => {
      const range = document.createRange();
      range.selectNodeContents(textNode);
      return Array.from(range.getClientRects())
        .filter((rect) => rect.width > 0 && rect.height > 0)
        .map((rect) => Math.round(rect.top));
    });
    const lines = new Set(lineTops).size;

    if (lines <= 1) return [];
    const rect = button.getBoundingClientRect();
    return [{
      text,
      lines,
      width: Math.round(rect.width),
      testId: (button as HTMLElement).dataset.testid || '',
      ariaLabel: button.getAttribute('aria-label') || '',
    }];
  }));

  expect.soft(
    brokenButtons,
    `${context}: single-word buttons are broken across lines`,
  ).toEqual([]);
};

const assertVisibleControlsDoNotClip = async (page: Page, context: string) => {
  const clipped = await page.locator('button:visible, input:visible, select:visible, textarea:visible').evaluateAll((elements) => (
    elements.flatMap((element) => {
      const node = element as HTMLElement;
      const horizontalClip = node.scrollWidth > node.clientWidth + 1;
      const verticalClip = element.tagName === 'BUTTON' && node.scrollHeight > node.clientHeight + 1;
      if (!horizontalClip && !verticalClip) return [];

      return [{
        tag: element.tagName.toLowerCase(),
        text: (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 100),
        testId: node.dataset.testid || '',
        scrollWidth: node.scrollWidth,
        clientWidth: node.clientWidth,
        scrollHeight: node.scrollHeight,
        clientHeight: node.clientHeight,
      }];
    })
  ));

  expect.soft(clipped, `${context}: visible controls clip their content`).toEqual([]);
};

const auditCurrentPage = async (page: Page, context: string, critical: Locator[]) => {
  await assertNoPageHorizontalOverflow(page, context);
  await assertLocatorInsideViewport(page.locator('main'), `${context} main`);
  for (const [index, locator] of critical.entries()) {
    await assertLocatorInsideViewport(locator, `${context} critical[${index}]`);
  }
  await assertNoBrokenSingleWordButtons(page, context);
  await assertVisibleControlsDoNotClip(page, context);
};

const openFirstTicketDetails = async (page: Page) => {
  await page.goto('/tickets');
  await expect(page.getByRole('heading', { name: 'Заявки' })).toBeVisible();
  const firstRow = page.getByTestId('task-inbox-row').first();
  await expect(firstRow).toBeVisible();
  const visibleOpenButton = firstRow.getByTestId('task-inbox-open').filter({ visible: true });
  await expect(visibleOpenButton).toHaveCount(1);
  await visibleOpenButton.click();
  await expect(page.getByTestId('task-details-modal')).toBeVisible();
};

test.describe('ServiceDesk responsive audit @responsive', () => {
  test.setTimeout(120_000);

  for (const viewport of viewports) {
    test(`${viewport.name}: critical routes, notifications and task details fit viewport`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await loginAsAdmin(page);

      for (const route of routeCases) {
        await test.step(`${route.path} at ${viewport.width}x${viewport.height}`, async () => {
          await page.goto(route.path);
          await expect(route.ready(page)).toBeVisible();
          await auditCurrentPage(page, `${route.path} ${viewport.width}x${viewport.height}`, route.critical(page));
        });
      }

      await test.step(`notification dropdown at ${viewport.width}x${viewport.height}`, async () => {
        await page.getByTestId('notification-bell').click();
        if (viewport.width < 640) {
          const mobileDrawer = page.getByTestId('notifications-drawer');
          await expect(mobileDrawer).toBeVisible();
          await expect(page.getByTestId('notifications-dropdown')).toHaveCount(0);
          await auditCurrentPage(page, `mobile notification drawer ${viewport.width}x${viewport.height}`, [mobileDrawer]);
          await mobileDrawer.getByRole('button', { name: 'Закрыть' }).click();
          return;
        }

        const dropdown = page.getByTestId('notifications-dropdown');
        await expect(dropdown).toBeVisible();
        await auditCurrentPage(page, `notification dropdown ${viewport.width}x${viewport.height}`, [dropdown]);
        await page.keyboard.press('Escape');
        if (await dropdown.isVisible()) await page.getByTestId('notification-bell').click();
      });

      await test.step(`notification drawer at ${viewport.width}x${viewport.height}`, async () => {
        await page.getByTestId('notification-bell').click();
        if (viewport.width >= 640) {
          await page.getByRole('button', { name: 'Все уведомления' }).click();
        }
        const drawer = page.getByTestId('notifications-drawer');
        await expect(drawer).toBeVisible();
        await auditCurrentPage(page, `notification drawer ${viewport.width}x${viewport.height}`, [drawer]);
        await expect.soft(drawer.getByRole('button', { name: 'Закрыть' }), 'notification drawer close button must stay readable').toBeVisible();
        await drawer.getByRole('button', { name: 'Закрыть' }).click();
      });

      await test.step(`TaskDetailsModal at ${viewport.width}x${viewport.height}`, async () => {
        await openFirstTicketDetails(page);
        const modal = page.getByTestId('task-details-modal');
        await auditCurrentPage(page, `TaskDetailsModal ${viewport.width}x${viewport.height}`, [
          modal,
          page.getByTestId('task-details-ticket-number'),
          page.getByTestId('task-details-current-status'),
          page.getByTestId('comments-list'),
          page.getByTestId('task-timeline'),
          page.getByTestId('task-email-thread'),
        ]);

        const modalBounds = await modal.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          return { top: rect.top, bottom: rect.bottom, viewportHeight: window.innerHeight };
        });
        expect.soft(modalBounds.top, 'TaskDetailsModal must not start above viewport').toBeGreaterThanOrEqual(-1);
        expect.soft(modalBounds.bottom, 'TaskDetailsModal must not end below viewport').toBeLessThanOrEqual(modalBounds.viewportHeight + 1);
      });
    });
  }
});
