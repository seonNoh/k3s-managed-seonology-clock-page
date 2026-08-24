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

  await page.getByRole('button', { name: '효과 설정 열기' }).click();
  const snowToggle = page.getByRole('button', { name: 'On', exact: true });
  await expect(snowToggle).toHaveAttribute('aria-pressed', 'true');
  await snowToggle.click();
  await expect(page.locator('.snow-field')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.snow-field')).toHaveCount(0);
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
