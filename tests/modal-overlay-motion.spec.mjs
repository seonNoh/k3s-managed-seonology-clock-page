import { test, expect } from '@playwright/test';

async function openClassicDashboard(page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Classic 레이아웃' }).click();
  await expect(page.locator('[data-dashboard-layout="classic"]')).toBeVisible();
}

async function openSplitDashboard(page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('[data-dashboard-layout="split"]')).toBeVisible();
}

async function expectWorkspaceBounds(locator, viewport, mode) {
  await locator.evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished.catch(() => undefined)));
  });
  const bounds = await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });

  if (mode === 'mobile') {
    expect(bounds.x).toBeLessThanOrEqual(1);
    expect(bounds.y).toBeLessThanOrEqual(1);
    expect(bounds.width).toBeGreaterThanOrEqual(viewport.width - 1);
    expect(bounds.height).toBeGreaterThanOrEqual(viewport.height - 1);
    return;
  }

  const minimum = mode === 'tablet'
    ? { width: viewport.width * 0.92, height: viewport.height * 0.88 }
    : { width: viewport.width * 0.9, height: viewport.height * 0.85 };
  expect(bounds.width).toBeGreaterThanOrEqual(minimum.width);
  expect(bounds.height).toBeGreaterThanOrEqual(minimum.height);
}

async function textContrastRatio(container, textSelector) {
  return container.evaluate((element, selector) => {
    const parseRgb = (value) => (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    const luminance = (rgb) => rgb
      .map((value) => value / 255)
      .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
      .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
    const foreground = luminance(parseRgb(getComputedStyle(element.querySelector(selector)).color));
    const background = luminance(parseRgb(getComputedStyle(element).backgroundColor));
    const lighter = Math.max(foreground, background);
    const darker = Math.min(foreground, background);
    return (lighter + 0.05) / (darker + 0.05);
  }, textSelector);
}

const workspaceViewports = [
  { name: 'desktop', width: 1440, height: 1000, mode: 'desktop' },
  { name: 'tablet', width: 1024, height: 768, mode: 'tablet' },
  { name: 'mobile', width: 390, height: 844, mode: 'mobile' },
];

const toolWorkspaces = [
  ['Notes', '.notes-panel'],
  ['AI Chat', '.chat-panel'],
  ['Markdown Preview', '.md-modal'],
  ['Unit Converter', '.uc-modal'],
  ['Base64', '.b64-modal'],
  ['JSON Formatter', '.jf-modal'],
  ['IP Lookup', '.ip-modal'],
  ['Password Generator', '.pwgen-modal'],
  ['Color Picker', '.cpick-modal'],
  ['Cron Editor', '.cron-modal'],
  ['CIDR / Subnet', '.subnet-modal'],
  ['SLO / SLI Calculator', '.slo-modal'],
  ['CI/CD Visualizer', '.cicd-container'],
  ['Excel to Markdown', '.e2m-container'],
  ['RBAC Visualizer', '.rbac-container'],
  ['Terraform Parser', '.tfp-container'],
  ['GitLab to GitHub', '.gl2gh-container'],
  ['Architecture Icon Search', '.archi-container'],
  ['Speed Test', '.speed-modal'],
  ['Regex Tester', '.rx-modal'],
  ['Epoch Converter', '.ep-modal'],
  ['Text Counter', '.tc-modal'],
  ['DNS Lookup', '.dns-modal'],
  ['Mermaid Editor', '.mm-modal'],
  ['Infrastructure Dashboard', '.infra-modal'],
  ['Repository Catalog', '.repocat-modal'],
  ['NAS Browser', '.nb-modal'],
  ['Google Drive', '.nb-modal'],
  ['OneDrive', '.nb-modal'],
];

for (const viewport of workspaceViewports) {
  test(`Split Tools는 ${viewport.name}에서 합의한 작업 공간 크기를 사용한다`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openSplitDashboard(page);
    await page.getByRole('button', { name: '도구 모음 열기' }).click();

    const dialog = page.locator('.split-tools-dialog');
    await expect(dialog).toBeVisible();
    await expectWorkspaceBounds(dialog, viewport, viewport.mode);
  });
}

test('Split의 개별 도구와 Classic 일반 모달도 큰 작업 공간을 사용한다', async ({ page }) => {
  const viewport = { width: 1440, height: 1000 };
  await page.setViewportSize(viewport);
  await openSplitDashboard(page);

  await page.getByRole('button', { name: '도구 모음 열기' }).click();
  await page.getByRole('button', { name: /Markdown Preview/ }).click();
  await expectWorkspaceBounds(page.locator('.md-modal'), viewport, 'desktop');
  await page.keyboard.press('Escape');
  await expect(page.locator('.split-tools-dialog')).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: /네트워크 측정/ }).click();
  await expectWorkspaceBounds(page.locator('.speed-modal'), viewport, 'desktop');
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Classic 레이아웃' }).click();
  await expect(page.locator('[data-dashboard-layout="classic"]')).toBeVisible();
  await page.getByRole('button', { name: 'Tools', exact: true }).click();
  await page.getByRole('textbox', { name: '도구 검색' }).fill('calendar');
  await page.getByRole('button', { name: 'Calendar', exact: true }).click();
  await expectWorkspaceBounds(page.locator('.modal-content'), viewport, 'desktop');
});

test('Split의 모든 웹 도구가 같은 데스크톱 작업 공간 크기를 사용한다', async ({ page }) => {
  test.setTimeout(120_000);
  const viewport = { width: 1440, height: 1000 };
  await page.setViewportSize(viewport);
  await openSplitDashboard(page);
  await page.getByRole('button', { name: '도구 모음 열기' }).click();

  for (const [name, panelSelector] of toolWorkspaces) {
    const search = page.getByRole('searchbox', { name: '도구 검색' });
    await search.fill(name);
    await page.locator('.split-tool-grid button').filter({ hasText: name }).first().click();
    const panel = page.locator(panelSelector);
    await expect(panel, name).toBeVisible();
    await expectWorkspaceBounds(panel, viewport, 'desktop');
    await page.keyboard.press('Escape');
    await expect(panel, `${name} close`).toHaveCount(0);
    await expect(page.locator('.split-tools-dialog'), `${name} launcher return`).toBeVisible();
  }

  await page.keyboard.press('Escape');
});

test('대화상자 제목과 조작 글자는 크게 읽을 수 있다', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openSplitDashboard(page);
  await page.getByRole('button', { name: '도구 모음 열기' }).click();

  const sizes = await page.locator('.split-tools-dialog').evaluate((dialog) => ({
    title: Number.parseFloat(getComputedStyle(dialog.querySelector('h2')).fontSize),
    input: Number.parseFloat(getComputedStyle(dialog.querySelector('input')).fontSize),
    button: Number.parseFloat(getComputedStyle(dialog.querySelector('.split-tool-grid button')).fontSize),
    label: Number.parseFloat(getComputedStyle(dialog.querySelector('.split-tool-grid button span')).fontSize),
  }));

  expect(sizes.title).toBeGreaterThanOrEqual(25);
  expect(sizes.input).toBeGreaterThanOrEqual(18);
  expect(sizes.button).toBeGreaterThanOrEqual(18);
  expect(sizes.label).toBeGreaterThanOrEqual(16);
});

test('모바일 전체 화면 모달의 제목과 닫기 버튼이 화면 설정 컨트롤에 가려지지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openSplitDashboard(page);
  await page.getByRole('button', { name: '도구 모음 열기' }).click();
  await page.evaluate(async () => document.activeViewTransition?.finished);
  await page.locator('.split-tools-dialog').evaluate(async (dialog) => {
    await Promise.all(dialog.getAnimations().map((animation) => animation.finished.catch(() => undefined)));
  });

  const obscuredHeaderControls = await page.locator('.split-tools-dialog > header').evaluate((header) => {
    const closeButton = header.querySelector('button');
    return [header.querySelector('h2'), closeButton].map((element) => {
      const rect = element.getBoundingClientRect();
      const topmost = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return {
        element: `${element.tagName}.${element.className}`,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        topmost: topmost ? `${topmost.tagName}.${topmost.className}` : null,
        obscured: element !== topmost && !element.contains(topmost),
      };
    }).filter((result) => result.obscured);
  });
  expect(obscuredHeaderControls).toEqual([]);

  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Classic 레이아웃' }).click();
  await expect(page.locator('[data-dashboard-layout="classic"]')).toBeVisible();
  await page.locator('.bottom-right-stack .mobile-drawer-handle').click();
  await page.getByRole('button', { name: 'Tools', exact: true }).click();
  await page.getByRole('textbox', { name: '도구 검색' }).fill('calendar');
  await page.getByRole('button', { name: 'Calendar', exact: true }).click();
  await page.evaluate(async () => document.activeViewTransition?.finished);

  const classicClose = page.locator('.modal-close');
  const classicCloseIsTopmost = await classicClose.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const topmost = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return element === topmost || element.contains(topmost);
  });
  expect(classicCloseIsTopmost).toBe(true);
});

test('짧은 효과 설정은 모바일에서도 콘텐츠 크기의 compact 대화상자를 유지한다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openSplitDashboard(page);
  await page.getByRole('button', { name: '효과 설정 열기' }).click();

  const bounds = await page.locator('.split-dialog--compact').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
  expect(bounds.width).toBeLessThanOrEqual(390 - 32);
  expect(bounds.height).toBeLessThan(844 * 0.8);
});

test('light 모드의 개별 도구와 Classic 모달은 읽을 수 있는 텍스트 명암을 유지한다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openSplitDashboard(page);
  await page.getByRole('button', { name: '도구 모음 열기' }).click();
  await page.getByRole('button', { name: /Markdown Preview/ }).click();
  await expect(textContrastRatio(page.locator('.md-modal'), '.md-header-title')).resolves.toBeGreaterThanOrEqual(4.5);

  await page.keyboard.press('Escape');
  await expect(page.locator('.split-tools-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Classic 레이아웃' }).click();
  await expect(page.locator('[data-dashboard-layout="classic"]')).toBeVisible();
  await page.locator('.bottom-right-stack .mobile-drawer-handle').click();
  await page.getByRole('button', { name: 'Tools', exact: true }).click();
  await page.getByRole('textbox', { name: '도구 검색' }).fill('calendar');
  await page.getByRole('button', { name: 'Calendar', exact: true }).click();
  await expect(textContrastRatio(page.locator('.modal-content'), '.modal-title')).resolves.toBeGreaterThanOrEqual(4.5);
});

test('일반 모션에서도 패널 밝기와 크기는 변하지 않는다', async ({ page }) => {
  await openSplitDashboard(page);
  await page.getByRole('button', { name: '도구 모음 열기' }).click();

  const dialog = page.locator('.split-tools-dialog');
  await expect(dialog).not.toHaveCSS('animation-name', 'none');
  await expect(dialog).toHaveCSS('animation-duration', '0.22s');
  await expect(dialog).toHaveCSS('opacity', '1');
  await expect(page.locator('.split-overlay')).toHaveCSS('animation-name', 'none');

  const keyframes = await dialog.evaluate((element) => {
    const animationName = getComputedStyle(element).animationName;
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of Array.from(sheet.cssRules)) {
          if (rule instanceof CSSKeyframesRule && rule.name === animationName) {
            return Array.from(rule.cssRules).map((frame) => frame.cssText).join(' ');
          }
        }
      } catch (error) {
        if (error.name !== 'SecurityError') throw error;
      }
    }
    return '';
  });
  expect(keyframes).not.toMatch(/opacity|scale/);
});

test('full-screen modal overlay rules do not animate the backdrop layer', async ({ page }) => {
  await openClassicDashboard(page);

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
  await openSplitDashboard(page);

  await page.getByRole('button', { name: '도구 모음 열기' }).click();
  await expect(page.locator('.split-tools-dialog')).toHaveCSS('animation-name', 'none');

  await page.getByRole('button', { name: '도구 모음 닫기' }).click();
  await page.getByRole('button', { name: 'Classic 레이아웃' }).click();

  await page.getByRole('button', { name: 'Tools', exact: true }).click();
  await expect(page.locator('.tools-modal')).toBeVisible();
  await expect(page.locator('.tools-modal')).toHaveCSS('animation-name', 'none');

  await page.getByRole('button', { name: 'Calendar', exact: true }).click();
  await expect(page.locator('.modal-content')).toBeVisible();
  await expect(page.locator('.modal-content')).toHaveCSS('animation-name', 'none');
});

test('Classic Tools에서 연 도구는 Escape로 Tools와 대시보드를 차례로 복원한다', async ({ page }) => {
  await openClassicDashboard(page);

  await page.getByRole('button', { name: 'Tools', exact: true }).click();
  await expect(page.locator('.tools-modal-overlay')).toBeVisible();

  await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  await expect(page.locator('.tools-modal-overlay')).toHaveCount(0);
  await expect(page.locator('.md-overlay')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.locator('.md-overlay')).toHaveCount(0);
  await expect(page.locator('.tools-modal-overlay')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.locator('.tools-modal-overlay')).toHaveCount(0);
});

test('Split Tools에서 연 도구도 Escape로 Tools와 대시보드를 차례로 복원한다', async ({ page }) => {
  await openSplitDashboard(page);

  await page.getByRole('button', { name: '도구 모음 열기' }).click();
  await page.getByRole('button', { name: /Markdown Preview/ }).click();
  await expect(page.locator('.md-overlay')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.locator('.md-overlay')).toHaveCount(0);
  await expect(page.locator('.split-tools-dialog')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.locator('.split-tools-dialog')).toHaveCount(0);
});

test('도구 모듈을 불러오는 동안 현재 Tools 셸을 유지한다', async ({ page }) => {
  let releaseModule;
  await page.route('**/src/components/JsonFormatter.jsx*', async (route) => {
    await new Promise((resolve) => { releaseModule = resolve; });
    await route.continue();
  });
  await openSplitDashboard(page);

  await page.getByRole('button', { name: '도구 모음 열기' }).click();
  await page.getByRole('button', { name: /JSON Formatter/ }).click();
  await expect.poll(() => Boolean(releaseModule)).toBe(true);

  await expect(page.locator('.split-tools-dialog')).toBeVisible();
  await expect(page.locator('.split-tool-pending')).toBeVisible();
  await expect(page.locator('.tool-loading-overlay')).toHaveCount(0);

  releaseModule();
  await expect(page.locator('.jf-overlay')).toBeVisible();
  await expect(page.locator('.split-tools-dialog')).toHaveCount(0);
});

test('tool launcher search has an accessible name', async ({ page }) => {
  await openClassicDashboard(page);

  await page.getByRole('button', { name: 'Tools', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '도구 검색' })).toHaveAttribute('aria-label', '도구 검색');
});

test('rapid tool selections leave only the last requested tool surface active', async ({ page }) => {
  await openClassicDashboard(page);
  await page.getByRole('button', { name: 'Tools', exact: true }).click();

  await page.locator('.tools-modal').evaluate((launcher) => {
    const buttons = Array.from(launcher.querySelectorAll('button'));
    buttons.find((button) => button.title === 'Markdown')?.click();
    buttons.find((button) => button.title === 'Base64')?.click();
  });

  await expect(page.locator('.b64-overlay')).toBeVisible();
  await expect(page.locator('.tools-modal-overlay')).toHaveCount(0);
  await expect(page.locator('.md-overlay')).toHaveCount(0);
  await expect(page.locator('.tools-modal-overlay, .b64-overlay, .md-overlay')).toHaveCount(1);
});

test('모바일에서도 Escape가 도구, Tools, 대시보드 순서로 돌아간다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openClassicDashboard(page);

  await page.locator('.bottom-right-stack .mobile-drawer-handle').click();
  await expect(page.locator('.bottom-right-stack')).toHaveClass(/drawer-open/);

  await page.getByRole('button', { name: 'Tools', exact: true }).click();
  await expect(page.locator('.tools-modal-overlay')).toBeVisible();

  await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  await expect(page.locator('.md-overlay')).toBeVisible();
  await expect(page.locator('.tools-modal-overlay')).toHaveCount(0);

  await page.keyboard.press('Escape');
  await expect(page.locator('.md-overlay')).toHaveCount(0);
  await expect(page.locator('.tools-modal-overlay')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.locator('.tools-modal-overlay')).toHaveCount(0);
  await expect(page.locator('.mobile-drawer-overlay')).toHaveCount(0);
});
