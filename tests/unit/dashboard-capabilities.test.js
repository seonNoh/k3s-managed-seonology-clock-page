import { describe, expect, it } from 'vitest';

import { WEB_TOOL_CATALOG } from '../../src/features/tool-launcher/toolRegistry.web.js';
import { DASHBOARD_CAPABILITIES } from '../../src/features/dashboard/dashboardLinks.js';

describe('dashboard capability contract', () => {
  it('두 레이아웃에서 유지해야 하는 대시보드 기능을 모두 선언한다', () => {
    expect(DASHBOARD_CAPABILITIES.core).toEqual([
      'search-suggestions',
      'services',
      'bookmarks-manage',
      'quick-links',
      'weather',
      'exchange',
      'todo',
      'calendar',
      'speedtest',
      'cursor-glow',
      'cursor-animation',
      'snow',
    ]);
  });

  it('웹 도구 레지스트리의 모든 도구를 기능 계약에 포함한다', () => {
    expect(DASHBOARD_CAPABILITIES.tools).toEqual(WEB_TOOL_CATALOG.map((tool) => tool.id));
  });
});
