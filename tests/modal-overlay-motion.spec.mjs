import { test, expect } from '@playwright/test';

test('full-screen modal overlay rules do not animate the backdrop layer', async ({ page }) => {
  await page.goto('/');

  const animatedOverlays = await page.evaluate(() => {
    const failures = [];
    const excluded = new Set(['.mobile-drawer-overlay']);

    const visit = (rules) => {
      for (const rule of Array.from(rules ?? [])) {
        if (rule instanceof CSSStyleRule) {
          const overlayClasses = rule.selectorText.match(/\.[\w-]*overlay\b/g) ?? [];
          const modalOverlays = overlayClasses.filter((name) => !excluded.has(name));
          const animationName = rule.style.animationName;

          if (modalOverlays.length > 0 && rule.style.position === 'fixed' && animationName && animationName !== 'none') {
            failures.push({ selector: rule.selectorText, animationName });
          }
        }
        if ('cssRules' in rule) visit(rule.cssRules);
      }
    };

    for (const sheet of Array.from(document.styleSheets)) {
      try {
        visit(sheet.cssRules);
      } catch (error) {
        if (error.name !== 'SecurityError') throw error;
      }
    }
    return failures;
  });

  expect(animatedOverlays).toEqual([]);
});

test('modal panels disable entry animation for reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  await page.getByRole('button', { name: 'Tools', exact: true }).click();
  await expect(page.locator('.tools-modal')).toBeVisible();
  await expect(page.locator('.tools-modal')).toHaveCSS('animation-name', 'none');

  await page.getByRole('button', { name: 'Calendar', exact: true }).click();
  await expect(page.locator('.modal-content')).toBeVisible();
  await expect(page.locator('.modal-content')).toHaveCSS('animation-name', 'none');
});

test('opening a tool replaces the launcher instead of stacking overlays', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Tools', exact: true }).click();
  await expect(page.locator('.tools-modal-overlay')).toBeVisible();

  await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  await expect(page.locator('.tools-modal-overlay')).toHaveCount(0);
  await expect(page.locator('.md-overlay')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.locator('.md-overlay')).toHaveCount(0);
  await expect(page.locator('.tools-modal-overlay')).toHaveCount(0);
});

test('tool launcher search has an accessible name', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Tools', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '도구 검색' })).toHaveAttribute('aria-label', '도구 검색');
});
