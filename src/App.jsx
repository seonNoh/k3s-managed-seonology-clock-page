import { lazy, Suspense, useEffect } from 'react';
import LoadingProgress from './components/LoadingProgress.jsx';
import SplitConsoleDashboard from './layouts/SplitConsoleDashboard.jsx';
import { usePersistentPreference } from './hooks/usePersistentPreference.js';
import { startUiTransition } from './ui/startUiTransition.js';
import './app-shell.css';
import './styles/modal-system.css';

const ClassicDashboard = lazy(() => import('./layouts/ClassicDashboard.jsx'));

function App() {
  const [layout, setLayout] = usePersistentPreference('layout');
  const [colorMode, setColorMode] = usePersistentPreference('colorMode');
  const [clockTheme, setClockTheme] = usePersistentPreference('clockTheme');
  const [snowEnabled, setSnowEnabled] = usePersistentPreference('snowEnabled');

  useEffect(() => {
    document.documentElement.dataset.colorMode = colorMode;
  }, [colorMode]);

  const updateViewPreference = (update, value) => {
    startUiTransition(() => update(value));
  };

  return (
    <div className="app-shell" data-color-mode={colorMode}>
      <nav className="view-controls" aria-label="화면 설정">
        <div className="view-control-group" aria-label="레이아웃 선택">
          <button
            type="button"
            aria-label="Split Console 레이아웃"
            aria-pressed={layout === 'split'}
            onClick={() => updateViewPreference(setLayout, 'split')}
          >
            Split
          </button>
          <button
            type="button"
            aria-label="Classic 레이아웃"
            aria-pressed={layout === 'classic'}
            onClick={() => updateViewPreference(setLayout, 'classic')}
          >
            Classic
          </button>
        </div>
        <div className="view-control-group" aria-label="색상 모드 선택">
          <button
            type="button"
            aria-label="Light mode"
            aria-pressed={colorMode === 'light'}
            onClick={() => updateViewPreference(setColorMode, 'light')}
          >
            Light
          </button>
          <button
            type="button"
            aria-label="Dark mode"
            aria-pressed={colorMode === 'dark'}
            onClick={() => updateViewPreference(setColorMode, 'dark')}
          >
            Dark
          </button>
        </div>
      </nav>

      {layout === 'classic' ? (
        <Suspense fallback={<div className="app-layout-loading"><LoadingProgress label="Classic 화면을 불러오는 중입니다." detail="레이아웃 모듈을 준비하고 있습니다." /></div>}>
          <ClassicDashboard colorMode={colorMode} />
        </Suspense>
      ) : (
        <SplitConsoleDashboard
          colorMode={colorMode}
          clockTheme={clockTheme}
          onClockThemeChange={setClockTheme}
          snowEnabled={snowEnabled}
          onSnowEnabledChange={setSnowEnabled}
        />
      )}
    </div>
  );
}

export default App;
