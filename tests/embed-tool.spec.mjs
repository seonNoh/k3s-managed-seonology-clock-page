import { test, expect } from '@playwright/test';

import { toolsForSurface } from '../packages/toolkit-core/src/catalog.js';

const WEB_TOOL_IDS = toolsForSurface('web').map((tool) => tool.id);

const REPRESENTATIVE_TOOLS = [
  { id: 'json', surface: '.jf-modal' },
  { id: 'base64', surface: '.b64-modal' },
  { id: 'cron', surface: '.cron-modal' },
  { id: 'notes', surface: '.notes-panel' },
  { id: 'clipboard', surface: '.clip-modal' },
];

const TOOL_SURFACE = '.embed-tool-host > [class$="-overlay"] > :is([class$="-modal"], [class$="-panel"], [class$="-container"])';
const GUTTER = 16;
const VIEWPORT = { width: 1024, height: 720 };

// Keep the run hermetic: the dev server has no API backend, and tools must not reach the network.
async function isolateNetwork(page) {
  await page.route((url) => url.hostname !== '127.0.0.1', (route) => route.abort());
  await page.route('**/api/clipboard/images', (route) => route.fulfill({
    json: { images: [], totalBytes: 0, limits: { maxImageBytes: 26214400, maxTotalBytes: 268435456, maxItems: 100 } },
  }));
  // Match on the pathname: Vite also serves source modules under /src/api/.
  await page.route(
    (url) => url.pathname.startsWith('/api/') && url.pathname !== '/api/clipboard/images',
    (route) => route.fulfill({ status: 503, json: { error: 'unavailable in test' } }),
  );
}

async function expectNoDashboardChrome(page) {
  await expect(page.locator('.view-controls')).toHaveCount(0);
  await expect(page.locator('[data-dashboard-layout]')).toHaveCount(0);
  await expect(page.locator('.split-ops-zone')).toHaveCount(0);
  await expect(page.locator('.clock-time, .clock-digits')).toHaveCount(0);
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await isolateNetwork(page);
});

for (const { id, surface } of REPRESENTATIVE_TOOLS) {
  test(`embed mode renders only the ${id} tool across the frame`, async ({ page }) => {
    await page.goto(`/?embed=1&tool=${id}`);

    const tool = page.locator(`.embed-tool-host ${surface}`);
    await expect(tool).toBeVisible();
    await expect(page.locator('.embed-shell')).toHaveAttribute('data-embed-tool', id);
    await expectNoDashboardChrome(page);

    const box = await tool.boundingBox();
    expect(Math.round(box.x)).toBe(GUTTER);
    expect(Math.round(box.y)).toBe(GUTTER);
    expect(Math.round(box.width)).toBe(VIEWPORT.width - GUTTER * 2);
    expect(Math.round(box.height)).toBe(VIEWPORT.height - GUTTER * 2);
  });
}

test('embed mode reports an unknown tool id in one line', async ({ page }) => {
  await page.goto('/?embed=1&tool=does-not-exist');

  await expect(page.getByRole('alert')).toHaveText('도구를 찾을 수 없습니다: does-not-exist');
  await expect(page.locator('.embed-tool-host')).toHaveCount(0);
  await expectNoDashboardChrome(page);
});

test('embed background follows prefers-color-scheme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/?embed=1&tool=json');
  await expect(page.locator('.jf-modal')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-color-mode', 'dark');
  await expect(page.locator('.embed-shell')).toHaveCSS('background-color', 'rgb(30, 30, 30)');
  await expect(page.locator('.jf-modal')).toHaveCSS('background-color', 'rgb(30, 30, 30)');

  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-color-mode', 'light');
  await expect(page.locator('.embed-shell')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(page.locator('.jf-modal')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
});

test('embed mode does not start dashboard-wide effects', async ({ page }) => {
  const requests = [];
  page.on('request', (request) => requests.push(new URL(request.url()).pathname));
  await page.addInitScript(() => {
    window.__embedProbe = { geolocation: 0, notification: 0, eventSources: [] };
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition = () => { window.__embedProbe.geolocation += 1; };
    }
    if ('Notification' in window) {
      Notification.requestPermission = () => { window.__embedProbe.notification += 1; return Promise.resolve('default'); };
    }
    const NativeEventSource = window.EventSource;
    window.EventSource = class extends NativeEventSource {
      constructor(url, init) {
        super(url, init);
        window.__embedProbe.eventSources.push(String(url));
      }
    };
  });

  await page.goto('/?embed=1&tool=json');
  await expect(page.locator('.jf-modal')).toBeVisible();
  await page.waitForTimeout(500);

  const probe = await page.evaluate(() => window.__embedProbe);
  expect(probe).toEqual({ geolocation: 0, notification: 0, eventSources: [] });
  expect(requests.filter((path) => path.startsWith('/api/'))).toEqual([]);
});

test('every web surface tool opens in embed mode', async ({ page }) => {
  const results = [];
  for (const id of WEB_TOOL_IDS) {
    const errors = [];
    const onError = (error) => errors.push(error.message);
    page.on('pageerror', onError);
    await page.goto(`/?embed=1&tool=${id}`);
    const surface = page.locator(TOOL_SURFACE);
    await expect(surface, `${id} surface`).toBeVisible();
    await expect(page.locator('.embed-shell')).toHaveAttribute('data-embed-tool', id);
    await expect(page.locator('.view-controls')).toHaveCount(0);
    page.off('pageerror', onError);
    results.push({ id, errors });
  }
  expect(results.filter((result) => result.errors.length)).toEqual([]);
  expect(results.map((result) => result.id)).toEqual(WEB_TOOL_IDS);
});
