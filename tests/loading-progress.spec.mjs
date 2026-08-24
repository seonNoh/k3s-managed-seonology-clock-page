import { test, expect } from '@playwright/test';

async function openCleanDashboard(page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('[data-dashboard-layout="split"]')).toBeVisible();
}

test('즐겨찾기와 클라우드 파일 대기는 퍼센트를 꾸며내지 않는 진행 레일을 사용한다', async ({ page }) => {
  let releaseBookmarks;
  let releaseDriveFiles;

  await page.route('**/api/services', route => route.fulfill({ json: { services: [] } }));
  await page.route('**/api/bookmarks', route => new Promise((resolve) => {
    releaseBookmarks = () => resolve(route.fulfill({ json: { categories: [] } }));
  }));
  await page.route('**/api/gdrive/status', route => route.fulfill({ json: { configured: true, connected: true } }));
  await page.route('**/api/gdrive/files**', route => new Promise((resolve) => {
    releaseDriveFiles = () => resolve(route.fulfill({ json: { files: [] } }));
  }));

  await openCleanDashboard(page);
  await page.getByRole('button', { name: /BOOKMARKS.*즐겨찾기 관리/ }).click();
  const bookmarkProgress = page.getByRole('progressbar', { name: '즐겨찾기를 불러오는 중입니다.' });
  await expect(bookmarkProgress).toBeVisible();
  await expect(bookmarkProgress).not.toHaveAttribute('aria-valuenow');
  await expect(page.locator('.loading-progress')).toContainText('서버 응답을 기다리고 있습니다.');
  await releaseBookmarks();
  await expect(bookmarkProgress).toHaveCount(0);
  await page.getByRole('button', { name: 'Close' }).click();

  await page.getByRole('button', { name: /GDrive/ }).click();
  const driveProgress = page.getByRole('progressbar', { name: 'Google Drive 파일을 불러오는 중입니다.' });
  await expect(driveProgress).toBeVisible();
  await expect(driveProgress).toHaveAttribute('aria-valuetext', '진행 중');
  await releaseDriveFiles();
  await expect(driveProgress).toHaveCount(0);
});

test('인프라는 세 데이터 소스의 실제 완료 수를 진행률로 표시한다', async ({ page }) => {
  const releases = {};
  const payloads = {
    cluster: { nodes: [], totalPods: 0, namespaces: {} },
    tailscale: { devices: [] },
    nas: { cpu: {}, memory: {}, volumes: [], disks: [], network: [], connections: [] },
  };

  for (const key of Object.keys(payloads)) {
    await page.route(`**/api/infra/${key}`, route => new Promise((resolve) => {
      releases[key] = () => resolve(route.fulfill({ json: payloads[key] }));
    }));
  }

  await openCleanDashboard(page);
  await page.getByRole('button', { name: /IF Infra/ }).click();
  const progress = page.getByRole('progressbar', { name: '인프라 상태를 동기화하는 중입니다.' });
  await expect(progress).toHaveAttribute('aria-valuenow', '0');
  await expect(page.locator('.loading-progress')).toContainText('데이터 소스 0/3 완료');

  await releases.cluster();
  await expect(page.locator('.loading-progress')).toContainText('33%');
  const progressBox = await page.locator('.infra-batch-progress').boundingBox();
  const infraBodyBox = await page.locator('.infra-body').boundingBox();
  expect(progressBox.x + progressBox.width).toBeLessThanOrEqual(infraBodyBox.x + infraBodyBox.width);
  await releases.tailscale();
  await expect(page.locator('.loading-progress')).toContainText('67%');
  await releases.nas();
  await expect(page.locator('.loading-progress')).toContainText('100%');
  await expect(progress).toHaveCount(0, { timeout: 2_000 });
});

test('축소 모션에서는 비확정형 진행 구간이 이동하지 않는다', async ({ page }) => {
  let releaseBookmarks;
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/services', route => route.fulfill({ json: { services: [] } }));
  await page.route('**/api/bookmarks', route => new Promise((resolve) => {
    releaseBookmarks = () => resolve(route.fulfill({ json: { categories: [] } }));
  }));

  await openCleanDashboard(page);
  await page.getByRole('button', { name: /BOOKMARKS.*즐겨찾기 관리/ }).click();
  await expect(page.locator('.loading-progress__fill')).toHaveCSS('animation-name', 'none');
  await releaseBookmarks();
});
