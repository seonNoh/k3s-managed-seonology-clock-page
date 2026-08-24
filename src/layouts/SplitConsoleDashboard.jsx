import { lazy, Suspense, useEffect, useMemo, useState } from 'react';

import BrowserStats from '../components/BrowserStats.jsx';
import Clock from '../components/Clock.jsx';
import CursorCanvas from '../components/CursorCanvas.jsx';
import LoadingProgress from '../components/LoadingProgress.jsx';
import CursorGlow from '../features/effects/CursorGlow.jsx';
import SnowField from '../components/SnowField.jsx';
import { usePersistentPreference } from '../hooks/usePersistentPreference.js';
import { getClockTemplate } from '../features/clock/clockCatalog.js';
import { CURSOR_ANIMATIONS, CURSOR_GLOW_EFFECTS } from '../features/effects/effectCatalog.js';
import { DASHBOARD_LINK_GROUPS } from '../features/dashboard/dashboardLinks.js';
import {
  GoogleSearch,
  StatusSummary,
  TodoSummary,
} from '../features/dashboard/DashboardWidgets.jsx';
import ServiceHub from '../features/dashboard/ServiceHub.jsx';
import ToolDock from '../features/tool-launcher/ToolDock.jsx';
import ToolsLauncher from '../features/tool-launcher/ToolsLauncher.jsx';
import { getWebTool } from '../features/tool-launcher/toolRegistry.web.js';
import './split-console.css';

const Calendar = lazy(() => import('../components/Calendar.jsx'));
const ExchangeRate = lazy(() => import('../components/ExchangeRate.jsx'));
const TodoList = lazy(() => import('../components/TodoList.jsx'));
const Weather = lazy(() => import('../components/Weather.jsx'));

const APP_VERSION = import.meta.env.VITE_APP_VERSION || '1.0.0';
function DashboardDialog({ title, eyebrow, onClose, children, compact = false }) {
  return (
    <div className="split-overlay" onMouseDown={onClose}>
      <section className={`split-dialog${compact ? ' split-dialog--compact' : ''}`} role="dialog" aria-modal="true" aria-labelledby="split-dialog-title" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div><span>{eyebrow}</span><h2 id="split-dialog-title">{title}</h2></div>
          <button type="button" className="split-dialog-close" onClick={onClose}>Close</button>
        </header>
        <div className="split-dialog-body">
          <Suspense fallback={<div className="split-dialog-loading"><LoadingProgress label="내용을 불러오는 중입니다." detail="필요한 화면 모듈을 준비하고 있습니다." compact /></div>}>
            {children}
          </Suspense>
        </div>
      </section>
    </div>
  );
}

function SplitConsoleDashboard({
  colorMode,
  clockTheme,
  onClockThemeChange,
  snowEnabled,
  onSnowEnabledChange,
}) {
  const [activeModal, setActiveModal] = useState(null);
  const [activeToolId, setActiveToolId] = useState(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [effectsOpen, setEffectsOpen] = useState(false);
  const [toolQuery, setToolQuery] = useState('');
  const [cursorGlow, setCursorGlow] = usePersistentPreference('cursorGlow');
  const [cursorAnimation, setCursorAnimation] = usePersistentPreference('cursorAnimation');
  const template = getClockTemplate(clockTheme);
  const activeTool = getWebTool(activeToolId);
  const ActiveToolComponent = activeTool?.component ?? null;
  const dateLabel = useMemo(() => new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  }).format(new Date()).toUpperCase(), []);

  const closeSurfaces = () => {
    setActiveModal(null);
    setActiveToolId(null);
    setToolsOpen(false);
    setEffectsOpen(false);
  };

  const transitionSurface = (update) => update();

  const openTool = (id) => {
    transitionSurface(() => {
      closeSurfaces();
      setActiveToolId(id);
    });
  };

  const openModal = (id) => {
    transitionSurface(() => {
      closeSurfaces();
      setActiveModal(id);
    });
  };

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') transitionSurface(closeSurfaces);
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        document.querySelector('[aria-label="Google 검색"]')?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  return (
    <main
      className="split-console"
      data-dashboard-layout="split"
      data-color-mode={colorMode}
      data-clock-layout={template.layout}
    >
      <SnowField enabled={snowEnabled} />
      <CursorGlow effect={cursorGlow} />
      <CursorCanvas effect={cursorAnimation} />

      <section className="split-clock-zone" aria-label="현재 시간">
        <header className="split-zone-head">
          <button type="button" onClick={() => openModal('services')}>SEONOLOGY</button>
          <span>LOCAL CLOCK / {template.name.toUpperCase()}</span>
        </header>
        <div className="split-clock-frame">
          <Clock theme={clockTheme} onThemeChange={onClockThemeChange} />
        </div>
        <StatusSummary onOpenWeather={() => openModal('weather')} onOpenExchange={() => openModal('exchange')} />
      </section>

      <section className="split-work-zone" aria-label="검색과 바로가기">
        <header className="split-work-head">
          <div><span>WORKSPACE</span><h1>Shift Console</h1></div>
          <div className="split-work-status"><span>{dateLabel}</span><BrowserStats /></div>
        </header>

        <GoogleSearch />

        <div className="split-link-sections">
          {DASHBOARD_LINK_GROUPS.map((group) => (
            <section className="split-link-group" key={group.id}>
              <header><span>{group.index}</span><h2>{group.name}</h2></header>
              <div>
                {group.links.map((link) => {
                  const external = link.href.startsWith('http');
                  return <a key={link.name} href={link.href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{link.name}</a>;
                })}
              </div>
            </section>
          ))}
        </div>

        <div className="split-work-actions">
          <TodoSummary onOpen={() => openModal('todo')} />
          <button type="button" className="split-summary-card" onClick={() => openTool('speedtest')}><span>SPEED TEST</span><b>네트워크 측정</b></button>
          <button type="button" className="split-summary-card" data-capability="bookmarks-manage" onClick={() => openModal('bookmarks')}><span>BOOKMARKS</span><b>즐겨찾기 관리</b></button>
        </div>
      </section>

      <ToolDock
        activeToolId={activeToolId}
        onOpenTool={openTool}
        onOpenTools={() => transitionSurface(() => { closeSurfaces(); setToolQuery(''); setToolsOpen(true); })}
        onOpenEffects={() => transitionSurface(() => { closeSurfaces(); setEffectsOpen(true); })}
      />

      <footer className="split-footer"><span>Craft by seon</span><span>React + Vite</span><span>v{APP_VERSION}</span></footer>

      <ToolsLauncher
        open={toolsOpen}
        query={toolQuery}
        onQueryChange={setToolQuery}
        onClose={() => transitionSurface(() => setToolsOpen(false))}
        onOpenTool={openTool}
        onOpenCalendar={() => openModal('calendar')}
      />

      {effectsOpen && (
        <DashboardDialog compact title="Effects" eyebrow="DISPLAY" onClose={() => transitionSurface(() => setEffectsOpen(false))}>
          <div className="split-effect-settings">
            <div><span>Snow field</span><button type="button" aria-pressed={snowEnabled} onClick={() => onSnowEnabledChange(!snowEnabled)}>{snowEnabled ? 'On' : 'Off'}</button></div>
            <label><span>Cursor glow</span><select aria-label="Cursor glow" value={cursorGlow} onChange={(event) => setCursorGlow(event.target.value)}>{CURSOR_GLOW_EFFECTS.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}</select></label>
            <label><span>Cursor animation</span><select value={cursorAnimation} onChange={(event) => setCursorAnimation(event.target.value)}>{CURSOR_ANIMATIONS.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}</select></label>
          </div>
        </DashboardDialog>
      )}

      {activeModal === 'services' && <DashboardDialog title="Services" eyebrow="SEONOLOGY" onClose={() => transitionSurface(() => setActiveModal(null))}><ServiceHub initialTab="services" /></DashboardDialog>}
      {activeModal === 'bookmarks' && <DashboardDialog title="Bookmarks" eyebrow="SEONOLOGY" onClose={() => transitionSurface(() => setActiveModal(null))}><ServiceHub initialTab="bookmarks" /></DashboardDialog>}
      {activeModal === 'weather' && <DashboardDialog title="Weather" eyebrow="LIVE STATUS" onClose={() => transitionSurface(() => setActiveModal(null))}><Weather /></DashboardDialog>}
      {activeModal === 'exchange' && <DashboardDialog title="Exchange Rate" eyebrow="LIVE STATUS" onClose={() => transitionSurface(() => setActiveModal(null))}><ExchangeRate /></DashboardDialog>}
      {activeModal === 'todo' && <DashboardDialog title="Todo" eyebrow="WORKSPACE" onClose={() => transitionSurface(() => setActiveModal(null))}><TodoList /></DashboardDialog>}
      {activeModal === 'calendar' && <DashboardDialog title="Calendar" eyebrow="WORKSPACE" onClose={() => transitionSurface(() => setActiveModal(null))}><Calendar /></DashboardDialog>}

      {ActiveToolComponent && (
        <Suspense fallback={<div className="tool-loading-overlay"><LoadingProgress label="도구를 불러오는 중입니다." detail="작업 공간을 준비하고 있습니다." /></div>}>
          <ActiveToolComponent isOpen onClose={() => transitionSurface(() => setActiveToolId(null))} {...(activeTool.props ?? {})} />
        </Suspense>
      )}
    </main>
  );
}

export default SplitConsoleDashboard;
