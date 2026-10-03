import { expect, test } from '@playwright/test';

test('an explicit API auth response navigates once and stops pending polling', async ({ page }) => {
  let documentRequests = 0;
  let apiRequests = 0;
  await page.route('**/auth-recovery-fixture?view=clock', route => {
    documentRequests += 1;
    return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Authentication recovery fixture</title>' });
  });
  await page.route('**/api/auth-recovery-probe', async route => {
    apiRequests += 1;
    await route.fulfill({ status: 401, headers: { 'X-Forward-Auth-Required': '1' }, body: '' });
  });
  await page.goto('/auth-recovery-fixture?view=clock#today');
  await page.evaluate(async () => {
    const { apiFetch } = await import('/src/api/client.js');
    const poll = async () => {
      try { await apiFetch('/api/auth-recovery-probe'); } catch { /* Navigation ends this document. */ }
    };
    void apiFetch('/api/auth-recovery-probe').catch(() => {
      for (let attempt = 0; attempt < 5; attempt += 1) void poll();
    });
  });
  await expect.poll(() => documentRequests).toBe(2);
  await page.waitForTimeout(150);
  expect(documentRequests).toBe(2);
  expect(apiRequests).toBe(1);
  await expect(page).toHaveURL(/\/auth-recovery-fixture\?view=clock#today$/);
});

test('an ordinary failed API response leaves the document in place', async ({ page }) => {
  await page.route('**/auth-recovery-fixture', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Authentication recovery fixture</title>' }));
  await page.route('**/api/auth-recovery-probe', route => route.fulfill({ status: 403, body: '' }));
  await page.goto('/auth-recovery-fixture');
  const status = await page.evaluate(async () => {
    const { apiFetch } = await import('/src/api/client.js');
    return (await apiFetch('/api/auth-recovery-probe')).status;
  });
  expect(status).toBe(403);
  await expect(page).toHaveURL(/\/auth-recovery-fixture$/);
});
