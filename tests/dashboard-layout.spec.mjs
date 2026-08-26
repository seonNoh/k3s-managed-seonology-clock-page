import { test, expect } from '@playwright/test';

const sizes = [
  { name: '320px mobile', width: 320, height: 720 },
  { name: '390px mobile', width: 390, height: 844 },
  { name: '768px tablet boundary', width: 768, height: 1024 },
  { name: '1024px tablet', width: 1024, height: 768 },
  { name: '1280px desktop', width: 1280, height: 800 },
  { name: '1440px desktop', width: 1440, height: 900 },
];

const clockTemplates = [
  { id: 'digital', name: 'Digital', layout: 'portrait' },
  { id: 'analog', name: 'Orbit', layout: 'square' },
  { id: 'flip', name: 'Flip', layout: 'panorama' },
  { id: 'neon', name: 'Neon', layout: 'portrait' },
  { id: 'binary', name: 'Binary', layout: 'square' },
  { id: 'word', name: 'Word', layout: 'panorama' },
  { id: 'progress', name: 'Progress', layout: 'panorama' },
  { id: 'swiss', name: 'Swiss', layout: 'square' },
  { id: 'matrix', name: 'Matrix', layout: 'panorama' },
  { id: 'dotmatrix', name: 'LED', layout: 'portrait' },
  { id: 'ring', name: 'Ring', layout: 'square' },
  { id: 'typography', name: 'Typo', layout: 'panorama' },
];

async function openWithCleanPreferences(page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
}

test('새 사용자는 Split Console을 보고 Classic 선택을 저장할 수 있다', async ({ page }) => {
  await openWithCleanPreferences(page);

  await expect(page.locator('[data-dashboard-layout="split"]')).toBeVisible();
  await page.getByRole('button', { name: 'Classic 레이아웃' }).click();
  await expect(page.locator('[data-dashboard-layout="classic"]')).toBeVisible();

  await page.reload();
  await expect(page.locator('[data-dashboard-layout="classic"]')).toBeVisible();
});

test('light와 dark mode를 전환하고 저장한다', async ({ page }) => {
  await openWithCleanPreferences(page);

  await expect(page.locator('.app-shell[data-color-mode="light"]')).toBeVisible();
  await page.getByRole('button', { name: 'Dark mode' }).click();
  await expect(page.locator('.app-shell[data-color-mode="dark"]')).toBeVisible();

  await page.reload();
  await expect(page.locator('.app-shell[data-color-mode="dark"]')).toBeVisible();
});

test('Classic 디자인에서도 light와 dark 색상 모드가 실제 배경에 적용된다', async ({ page }) => {
  await openWithCleanPreferences(page);
  await page.getByRole('button', { name: 'Classic 레이아웃' }).click();
  const dashboard = page.locator('[data-dashboard-layout="classic"]');
  await expect(dashboard).toHaveAttribute('data-color-mode', 'light');
  const lightBackground = await dashboard.evaluate(element => getComputedStyle(element).backgroundColor);

  await page.getByRole('button', { name: 'Dark mode' }).click();
  await expect(dashboard).toHaveAttribute('data-color-mode', 'dark');
  const darkBackground = await dashboard.evaluate(element => getComputedStyle(element).backgroundColor);
  expect(darkBackground).not.toBe(lightBackground);
});

test('panorama 시계의 헤더가 화면 설정 컨트롤과 겹치지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openWithCleanPreferences(page);
  await page.getByRole('button', { name: '시계 템플릿 변경' }).click();
  await page.getByRole('button', { name: 'Flip', exact: true }).click();

  const bounds = await page.evaluate(() => {
    const header = document.querySelector('.split-zone-head > span').getBoundingClientRect();
    const controls = document.querySelector('.view-controls').getBoundingClientRect();
    return { headerRight: header.right, controlsLeft: controls.left };
  });
  expect(bounds.headerRight).toBeLessThanOrEqual(bounds.controlsLeft);
});

test('Split Console의 상태·도구·효과 진입점이 실제 기능 화면에 연결된다', async ({ page }) => {
  await openWithCleanPreferences(page);
  await expect(page.locator('.snow-field')).toHaveCount(1);

  await page.getByRole('button', { name: /WEATHER/ }).click();
  await expect(page.getByRole('dialog', { name: 'Weather' })).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();

  await page.getByRole('button', { name: /EXCHANGE/ }).click();
  await expect(page.getByRole('dialog', { name: 'Exchange Rate' })).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();

  await page.getByRole('button', { name: '도구 모음 열기' }).click();
  await expect(page.getByRole('dialog', { name: 'Tools' })).toBeVisible();
  await page.getByRole('searchbox', { name: '도구 검색' }).fill('calendar');
  await page.getByRole('button', { name: 'CA Calendar' }).click();
  await expect(page.getByRole('dialog', { name: 'Calendar' })).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('dialog', { name: 'Tools' })).toBeVisible();
  await page.getByRole('button', { name: '도구 모음 닫기' }).click();

  await page.getByRole('button', { name: '효과 설정 열기' }).click();
  const snowToggle = page.getByRole('button', { name: 'On', exact: true });
  await expect(snowToggle).toHaveAttribute('aria-pressed', 'true');
  await snowToggle.click();
  await expect(page.locator('.snow-field')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.snow-field')).toHaveCount(0);
});

test('Split Console Google 검색은 API 자동완성과 키보드 탐색을 제공한다', async ({ page }) => {
  await page.route('**/api/suggest**', (route) => route.fulfill({ json: ['clock test', 'clock timer'] }));
  await openWithCleanPreferences(page);

  const search = page.getByRole('searchbox', { name: 'Google 검색' });
  await search.fill('clock');
  await expect(page.getByRole('option', { name: 'clock test' })).toBeVisible();
  await search.press('ArrowDown');
  await expect(page.getByRole('option', { name: 'clock test' })).toHaveAttribute('aria-selected', 'true');
});

test('Split Console 검색 추천 창은 light와 dark mode에서 불투명한 표면을 사용한다', async ({ page }) => {
  await page.route('**/api/suggest**', (route) => route.fulfill({ json: ['clock test', 'clock timer'] }));
  await openWithCleanPreferences(page);

  const search = page.getByRole('searchbox', { name: 'Google 검색' });
  const suggestions = page.getByRole('listbox', { name: 'Google 검색 제안' });
  await search.fill('clock');
  await expect(suggestions).toBeVisible();
  await expect(suggestions).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');

  await page.getByRole('button', { name: 'Dark mode' }).click();
  await search.click();
  await expect(suggestions).toBeVisible();
  await expect(suggestions).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
});

test('Split Console은 Classic과 같은 커서 광원 효과를 저장한다', async ({ page }) => {
  await openWithCleanPreferences(page);
  await page.getByRole('button', { name: '효과 설정 열기' }).click();
  await page.getByLabel('Cursor glow').selectOption('ocean');
  await expect(page.locator('.cursor-glow')).toHaveAttribute('data-effect', 'ocean');
  await page.reload();
  await expect(page.locator('.cursor-glow')).toHaveAttribute('data-effect', 'ocean');
});

test('모달과 도구 전환에는 문서 전체 View Transition을 사용하지 않는다', async ({ page }) => {
  await page.addInitScript(() => {
    window.__viewTransitionCalls = 0;
    document.startViewTransition = (update) => {
      window.__viewTransitionCalls += 1;
      update();
      return { finished: Promise.resolve(), ready: Promise.resolve(), updateCallbackDone: Promise.resolve(), skipTransition() {} };
    };
  });
  await openWithCleanPreferences(page);

  await page.getByRole('button', { name: '도구 모음 열기' }).click();
  await page.getByRole('button', { name: '도구 모음 닫기' }).click();
  expect(await page.evaluate(() => window.__viewTransitionCalls)).toBe(0);

  await page.getByRole('button', { name: 'Classic 레이아웃' }).click();
  expect(await page.evaluate(() => window.__viewTransitionCalls)).toBe(1);
  await page.getByRole('button', { name: 'Tools', exact: true }).click();
  expect(await page.evaluate(() => window.__viewTransitionCalls)).toBe(1);
});

test('클라우드 상태 장애를 OAuth 자격 증명 누락으로 잘못 표시하지 않는다', async ({ page }) => {
  await page.route('**/api/gdrive/status', (route) => route.fulfill({
    status: 503,
    json: { error: 'Google Drive is unavailable' },
  }));
  await openWithCleanPreferences(page);

  await page.getByRole('button', { name: 'GDrive' }).click();
  await expect(page.getByRole('alert')).toContainText('service is temporarily unavailable');
  await expect(page.getByText('OAuth credentials are missing')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
});

test('기존 도구 팝업에도 Split Console의 작업 공간 디자인을 적용한다', async ({ page }) => {
  await page.route('**/api/gdrive/status', (route) => route.fulfill({ json: { configured: false, connected: false } }));
  await page.route('**/api/notes', (route) => route.fulfill({ json: { notes: [] } }));
  await openWithCleanPreferences(page);

  await page.getByRole('button', { name: 'GDrive' }).click();
  const cloudModal = page.locator('.nb-modal');
  await expect(cloudModal).toBeVisible();
  const cloudStyle = await cloudModal.evaluate((element) => ({
    accent: getComputedStyle(element).getPropertyValue('--tool-accent').trim(),
    radius: getComputedStyle(element).borderRadius,
    width: element.getBoundingClientRect().width,
  }));
  expect(cloudStyle.accent).toBe('#526fd1');
  expect(cloudStyle.radius).toBe('10px');
  expect(cloudStyle.width).toBeGreaterThan(page.viewportSize().width * 0.85);
  await page.locator('.nb-close-btn').click();

  await page.getByRole('button', { name: '도구 모음 열기' }).click();
  await page.getByRole('button', { name: /Notes/ }).click();
  await expect(page.locator('.notes-panel')).toHaveCSS('--tool-accent', '#526fd1');
  await expect(page.locator('.notes-panel')).toHaveCSS('border-radius', '10px');
});

test('Split Console에서 즐겨찾기 전체 관리와 서비스 탭을 사용할 수 있다', async ({ page }) => {
  let bookmarks = {
    categories: [{
      id: 'cat-1',
      name: 'Work',
      order: 0,
      bookmarks: [{
        id: 'bm-1',
        name: 'Example Docs',
        url: 'https://example.com/',
        icon: 'book',
        color: '#526fd1',
        quickLink: true,
      }],
    }],
  };

  await page.route('**/api/bookmarks**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'GET' && url.pathname === '/api/bookmarks') {
      await route.fulfill({ json: bookmarks });
      return;
    }
    if (request.method() === 'POST' && url.pathname === '/api/bookmarks/categories') {
      const input = request.postDataJSON();
      const category = { id: 'cat-2', name: input.name, order: bookmarks.categories.length, bookmarks: [] };
      bookmarks = { categories: [...bookmarks.categories, category] };
      await route.fulfill({ json: { success: true, category } });
      return;
    }
    await route.fulfill({ status: 200, json: { success: true } });
  });
  await page.route('**/api/services', (route) => route.fulfill({ json: { services: [] } }));

  await openWithCleanPreferences(page);
  await page.getByRole('button', { name: /BOOKMARKS.*즐겨찾기 관리/ }).click();
  await expect(page.getByRole('dialog', { name: 'Bookmarks' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Example Docs example.com' })).toBeVisible();
  await page.getByRole('button', { name: '편집' }).click();
  await page.getByRole('button', { name: '카테고리 추가' }).click();
  await page.getByRole('textbox', { name: '카테고리 이름' }).fill('Personal');
  await page.getByRole('button', { name: '추가', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Personal' })).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();

  await page.getByRole('button', { name: 'SEONOLOGY', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Services' })).toBeVisible();
  await page.getByRole('tab', { name: 'Bookmarks' }).click();
  await expect(page.getByRole('link', { name: 'Example Docs example.com' })).toBeVisible();
});

test('390px 모바일의 표시 중인 핵심 조작 요소는 44px 터치 높이를 확보한다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openWithCleanPreferences(page);
  const undersized = await page.evaluate(() => [...document.querySelectorAll('.view-controls button, .split-console button, .split-console a, .split-console input')]
    .filter(element => element.getClientRects().length > 0)
    .map(element => ({ label: element.getAttribute('aria-label') || element.textContent.trim(), height: element.getBoundingClientRect().height }))
    .filter(item => item.height < 44));
  expect(undersized).toEqual([]);
});

for (const size of sizes) {
  test(`${size.name}에서 핵심 화면이 수평으로 잘리지 않는다`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await openWithCleanPreferences(page);

    await expect(page.locator('[data-dashboard-layout="split"]')).toBeVisible();
    await expect(page.getByRole('searchbox', { name: 'Google 검색' })).toBeVisible();
    await expect(page.getByRole('button', { name: '도구 모음 열기' })).toBeVisible();

    const overflow = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
    }));
    expect(overflow.documentWidth).toBeLessThanOrEqual(overflow.viewportWidth + 1);
  });
}

for (const viewport of [{ name: 'mobile', width: 390, height: 844 }, { name: 'desktop', width: 1440, height: 900 }]) {
  test(`${viewport.name}에서 12개 시계가 레이아웃을 전환해도 수평으로 잘리지 않는다`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openWithCleanPreferences(page);

    for (const template of clockTemplates) {
      await page.getByRole('button', { name: '시계 템플릿 변경' }).click();
      await page.getByRole('button', { name: template.name, exact: true }).click();
      await expect(page.locator(`[data-clock-template="${template.id}"]`)).toBeVisible();
      await expect(page.locator(`[data-dashboard-layout="split"][data-clock-layout="${template.layout}"]`)).toBeVisible();
      const overflow = await page.evaluate(() => ({
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth,
      }));
      expect(overflow.documentWidth, `${template.id} document width`).toBeLessThanOrEqual(overflow.viewportWidth + 1);
    }
  });
}

for (const viewport of [{ name: 'classic mobile', width: 390, height: 844 }, { name: 'classic tablet', width: 768, height: 1024 }]) {
  test(`${viewport.name}에서도 기존 디자인의 핵심 화면이 수평으로 잘리지 않는다`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openWithCleanPreferences(page);
    await page.getByRole('button', { name: 'Classic 레이아웃' }).click();
    await expect(page.locator('[data-dashboard-layout="classic"]')).toBeVisible();
    const overflow = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
    }));
    expect(overflow.documentWidth).toBeLessThanOrEqual(overflow.viewportWidth + 1);
  });
}
