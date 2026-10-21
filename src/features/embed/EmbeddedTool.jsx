import { Suspense, useEffect, useLayoutEffect, useSyncExternalStore } from 'react';

import LoadingProgress from '../../components/LoadingProgress.jsx';
import { getWebTool } from '../tool-launcher/toolRegistry.web.js';
import { readPreferredColorMode, subscribePreferredColorMode } from './embedRequest.js';
import './embed-tool.css';

// The embedding window owns the close control, so the tool's own close action is inert.
const noop = () => {};

function usePreferredColorMode() {
  return useSyncExternalStore(
    subscribePreferredColorMode,
    () => readPreferredColorMode(),
    () => 'light',
  );
}

function EmbeddedTool({ toolId }) {
  const colorMode = usePreferredColorMode();
  const tool = getWebTool(toolId);

  // Apply before paint so the tool never flashes in the other color mode.
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.embed = 'tool';
    root.dataset.colorMode = colorMode;
  }, [colorMode]);

  useEffect(() => {
    document.title = tool ? tool.name : 'Tool not found';
  }, [tool]);

  return (
    <div className="embed-shell" data-embed-tool={tool?.id ?? ''} data-color-mode={colorMode}>
      {tool ? (
        <div className="embed-tool-host">
          <Suspense fallback={<div className="embed-tool-loading"><LoadingProgress label={`${tool.name} 도구를 불러오는 중입니다.`} compact /></div>}>
            <tool.component isOpen onClose={noop} {...(tool.props ?? {})} />
          </Suspense>
        </div>
      ) : (
        <p className="embed-tool-missing" role="alert">도구를 찾을 수 없습니다: {toolId}</p>
      )}
    </div>
  );
}

export default EmbeddedTool;
