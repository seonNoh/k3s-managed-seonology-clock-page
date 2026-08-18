import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { test, expect } from '@playwright/test';

const extensionDist = resolve(process.cwd(), 'toolkit-extension/dist');
const contentTypes = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
};

let popupServer;
let popupBaseUrl;

test.beforeAll(async () => {
  popupServer = createServer(async (request, response) => {
    const requestPath = new URL(request.url, 'http://127.0.0.1').pathname;
    const assetPath = resolve(extensionDist, `.${requestPath === '/' ? '/popup.html' : requestPath}`);

    if (!assetPath.startsWith(`${extensionDist}/`) && assetPath !== resolve(extensionDist, 'popup.html')) {
      response.writeHead(403).end();
      return;
    }

    try {
      const asset = await readFile(assetPath);
      response.writeHead(200, { 'content-type': contentTypes[extname(assetPath)] || 'application/octet-stream' });
      response.end(asset);
    } catch {
      response.writeHead(404).end();
    }
  });

  await new Promise((resolveServer) => popupServer.listen(0, '127.0.0.1', resolveServer));
  const { port } = popupServer.address();
  popupBaseUrl = `http://127.0.0.1:${port}`;
});

test.afterAll(async () => {
  await new Promise((resolveServer) => popupServer.close(resolveServer));
});

test('built extension popup mounts #root without console errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto(`${popupBaseUrl}/popup.html`);

  await expect(page.locator('#root .popup-container')).toBeVisible();
  expect(errors).toEqual([]);
});
