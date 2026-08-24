import { describe, expect, it } from 'vitest';

import { parseCloudStatusResponse } from '../../src/features/tool-launcher/cloudStatus.js';

describe('cloud status response', () => {
  it('keeps an unavailable service distinct from missing OAuth credentials', async () => {
    const response = new Response(JSON.stringify({ error: 'Google Drive is unavailable' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });

    await expect(parseCloudStatusResponse(response)).rejects.toThrow('Google Drive is unavailable');
  });

  it('returns the configured and connected flags for a successful status response', async () => {
    const response = new Response(JSON.stringify({ configured: true, connected: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

    await expect(parseCloudStatusResponse(response)).resolves.toEqual({ configured: true, connected: true });
  });
});
