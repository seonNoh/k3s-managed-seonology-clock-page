import { Suspense, useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Sun, CloudSun, Cloud, CloudRain, CloudSnow, CloudLightning, CloudFog, Square, CalendarDays } from 'lucide-react';
import Clock from '../components/Clock';
import CursorCanvas from '../components/CursorCanvas';
import Weather from '../components/Weather';
import TodoList from '../components/TodoList';
import Calendar from '../components/Calendar';
import ExchangeRate from '../components/ExchangeRate';
import LoadingProgress from '../components/LoadingProgress';
import BrowserStats from '../components/BrowserStats';
import { SpeedTestMini } from '../components/SpeedTestMini';
import { API_BASE, getSafeExternalUrl, requestJson } from '../api/client';
import { closeTopDialog, filterToolCatalog, openToolDialog, openToolLauncher } from '../features/tool-launcher/dialog-state';
import { getWebTool, WEB_TOOL_CATALOG } from '../features/tool-launcher/toolRegistry.web';
import SharedGoogleSearch from '../features/dashboard/GoogleSearch';
import ServiceHub from '../features/dashboard/ServiceHub';
import CursorGlow from '../features/effects/CursorGlow';
import { CURSOR_ANIMATIONS, CURSOR_GLOW_EFFECTS } from '../features/effects/effectCatalog';
import { usePersistentPreference } from '../hooks/usePersistentPreference';
import '../App.css';

// Import version from VERSION file (will be replaced at build time)
const APP_VERSION = import.meta.env.VITE_APP_VERSION || '1.0.0';
const TOOL_GRID_IDS = new Set([
  'notes', 'markdown', 'chat', 'unit', 'base64', 'json', 'ip', 'password',
  'color', 'cron', 'subnet', 'slo', 'cicd', 'excel', 'rbac', 'terraform',
  'gl2gh', 'archicon', 'regex', 'epoch', 'textcounter', 'dns', 'mermaid',
]);

// Services will be loaded from API

// Weather widget - centered top (auto-refresh every 5 minutes)
function WeatherWidget({ onClick }) {
  const [data, setData] = useState(null);
  const [coords, setCoords] = useState({ lat: 37.5665, lon: 126.9780 });

  // Initialize location once
  useEffect(() => {
    navigator.geolocation?.getCurrentPosition((pos) => {
      setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude });
    });
  }, []);

  // Fetch weather when coords are available and set up interval
  useEffect(() => {
    if (!coords) return;

    const fetchWeather = async () => {
      try {
        const res = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current=temperature_2m,weather_code`
        );
        const result = await res.json();
        setData({
          temp: Math.round(result.current.temperature_2m),
          code: result.current.weather_code,
        });
      } catch {
        setData(null);
      }
    };

    // Fetch immediately
    fetchWeather();

    // Auto-refresh every 15 minutes (900000ms)
    const interval = setInterval(fetchWeather, 900000);

    return () => clearInterval(interval);
  }, [coords]);

  const getIcon = (code) => {
    const iconProps = { size: 48, strokeWidth: 1.5 };
    if (code === 0) return <Sun {...iconProps} />;
    if (code <= 3) return <CloudSun {...iconProps} />;
    if (code <= 48) return <CloudFog {...iconProps} />;
    if (code <= 67) return <CloudRain {...iconProps} />;
    if (code <= 77) return <CloudSnow {...iconProps} />;
    if (code <= 82) return <CloudRain {...iconProps} />;
    return <CloudLightning {...iconProps} />;
  };

  return (
    <div className="top-widget weather-widget" onClick={onClick}>
      <span className="widget-icon">{data ? getIcon(data.code) : <Cloud size={48} strokeWidth={1.5} />}</span>
      <span className="widget-text">{data ? `${data.temp}°` : '--°'}</span>
    </div>
  );
}

// Exchange rate widget - centered top (auto-refresh every 5 minutes)
function ExchangeWidget({ onClick }) {
  const [rate, setRate] = useState(null);

  useEffect(() => {
    const fetchRate = async () => {
      try {
        const res = await fetch('https://api.manana.kr/exchange/rate/KRW/KRW,JPY.json');
        const data = await res.json();
        const jpyEntry = data.find(item => item.name === 'JPYKRW=X');
        if (jpyEntry) {
          const jpyPer100Krw = (jpyEntry.rate * 100).toFixed(2);
          setRate(jpyPer100Krw);
        }
      } catch {
        setRate(null);
      }
    };

    fetchRate();

    // Auto-refresh every 5 minutes (300000ms) - real-time API
    const interval = setInterval(fetchRate, 300000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="top-widget exchange-widget" onClick={onClick}>
      <span className="widget-text">₩100 = ¥{rate || '--'}</span>
    </div>
  );
}

// Todo preview in bottom-left
function TodoPreview({ onClick }) {
  const [todos, setTodos] = useState([]);

  useEffect(() => {
    const fetchTodos = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/todos`);
        const data = await res.json();
        const pending = (data.todos || []).filter(t => !t.completed).slice(0, 3);
        setTodos(pending);
      } catch {
        setTodos([]);
      }
    };
    fetchTodos();
    const interval = setInterval(fetchTodos, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="todo-preview" onClick={onClick}>
      <div className="todo-preview-header">
        <span className="todo-icon"><Square size={18} /></span>
        <span className="todo-title">Todo</span>
        {todos.length > 0 && <span className="todo-count">{todos.length}</span>}
      </div>
      {todos.length > 0 ? (
        <div className="todo-preview-list">
          {todos.map((todo, i) => (
            <div key={i} className="todo-preview-item">
              <span className="todo-bullet">•</span>
              <span className="todo-text">{todo.text.length > 25 ? todo.text.slice(0, 25) + '...' : todo.text}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="todo-preview-empty">할 일 없음</div>
      )}
    </div>
  );
}

// Calendar icon
function CalendarIcon({ onClick }) {
  const today = new Date();
  return (
    <div className="ambient-item calendar-item" onClick={onClick}>
      <span className="ambient-symbol"><CalendarDays size={26} strokeWidth={1.5} /></span>
      <span className="ambient-value">{today.getDate()}</span>
    </div>
  );
}

// Modal component
function Modal({ isOpen, onClose, title, children }) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {children}
        </div>
      </div>
    </div>
  );
}

// Service icon SVGs
function VaultIcon() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
      <rect x="12" y="16" width="40" height="36" rx="2" stroke="currentColor" strokeWidth="2" fill="none"/>
      <circle cx="32" cy="34" r="8" stroke="currentColor" strokeWidth="2" fill="none"/>
      <line x1="32" y1="34" x2="38" y2="34" stroke="currentColor" strokeWidth="2"/>
      <line x1="32" y1="34" x2="32" y2="40" stroke="currentColor" strokeWidth="2"/>
      <rect x="28" y="10" width="8" height="6" fill="currentColor"/>
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
      <circle cx="20" cy="32" r="8" stroke="currentColor" strokeWidth="2" fill="none"/>
      <line x1="26" y1="28" x2="48" y2="28" stroke="currentColor" strokeWidth="2"/>
      <rect x="40" y="24" width="4" height="8" fill="currentColor"/>
      <rect x="46" y="24" width="4" height="8" fill="currentColor"/>
    </svg>
  );
}

function GitOpsIcon() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
      <path d="M16 32 L32 16 L48 32" stroke="currentColor" strokeWidth="2" fill="none"/>
      <path d="M32 16 L32 48" stroke="currentColor" strokeWidth="2"/>
      <circle cx="32" cy="48" r="4" fill="currentColor"/>
      <circle cx="16" cy="32" r="4" fill="currentColor"/>
      <circle cx="48" cy="32" r="4" fill="currentColor"/>
    </svg>
  );
}

function TerminalIcon() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
      <rect x="8" y="12" width="48" height="40" rx="2" stroke="currentColor" strokeWidth="2" fill="none"/>
      <path d="M16 24 L24 32 L16 40" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="28" y1="40" x2="44" y2="40" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
      <circle cx="32" cy="32" r="20" stroke="currentColor" strokeWidth="2" fill="none"/>
      <line x1="32" y1="32" x2="32" y2="20" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <line x1="32" y1="32" x2="42" y2="32" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="32" cy="32" r="2" fill="currentColor"/>
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
      <rect x="12" y="36" width="8" height="16" fill="currentColor"/>
      <rect x="24" y="28" width="8" height="24" fill="currentColor"/>
      <rect x="36" y="20" width="8" height="32" fill="currentColor"/>
      <rect x="48" y="32" width="8" height="20" fill="currentColor"/>
    </svg>
  );
}

function ActivityIcon() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
      <path d="M8 32 L16 32 L24 16 L32 48 L40 24 L48 32 L56 32" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function PortalIcon() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
      <circle cx="32" cy="32" r="20" stroke="currentColor" strokeWidth="2" fill="none"/>
      <circle cx="32" cy="32" r="12" stroke="currentColor" strokeWidth="2" fill="none"/>
      <circle cx="32" cy="32" r="4" fill="currentColor"/>
    </svg>
  );
}

function NoteIcon() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
      <path d="M16 12 L48 12 L48 52 L16 52 Z" stroke="currentColor" strokeWidth="2" fill="none"/>
      <line x1="24" y1="24" x2="40" y2="24" stroke="currentColor" strokeWidth="2"/>
      <line x1="24" y1="32" x2="40" y2="32" stroke="currentColor" strokeWidth="2"/>
      <line x1="24" y1="40" x2="32" y2="40" stroke="currentColor" strokeWidth="2"/>
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
      <rect x="12" y="16" width="40" height="28" rx="4" stroke="currentColor" strokeWidth="2" fill="none"/>
      <path d="M24 44 L32 52 L32 44" stroke="currentColor" strokeWidth="2" fill="none"/>
      <line x1="20" y1="28" x2="44" y2="28" stroke="currentColor" strokeWidth="2"/>
      <line x1="20" y1="36" x2="36" y2="36" stroke="currentColor" strokeWidth="2"/>
    </svg>
  );
}

function ContentIcon() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
      <rect x="16" y="12" width="32" height="40" rx="2" stroke="currentColor" strokeWidth="2" fill="none"/>
      <line x1="24" y1="24" x2="40" y2="24" stroke="currentColor" strokeWidth="2"/>
      <line x1="24" y1="32" x2="40" y2="32" stroke="currentColor" strokeWidth="2"/>
      <line x1="24" y1="40" x2="32" y2="40" stroke="currentColor" strokeWidth="2"/>
    </svg>
  );
}

function CodeIcon() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
      <path d="M24 20 L12 32 L24 44" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M40 20 L52 32 L40 44" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="36" y1="16" x2="28" y2="48" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

function BookIcon() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
      <path d="M16 12 L16 52 L32 44 L48 52 L48 12 Z" stroke="currentColor" strokeWidth="2" fill="none"/>
      <line x1="32" y1="12" x2="32" y2="44" stroke="currentColor" strokeWidth="2"/>
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
      <path d="M12 20 L12 48 L52 48 L52 24 L32 24 L28 20 Z" stroke="currentColor" strokeWidth="2" fill="none"/>
    </svg>
  );
}

function K8sIcon() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
      <path d="M32 12 L48 24 L48 40 L32 52 L16 40 L16 24 Z" stroke="currentColor" strokeWidth="2" fill="none"/>
      <circle cx="32" cy="32" r="8" stroke="currentColor" strokeWidth="2" fill="none"/>
      <line x1="32" y1="24" x2="32" y2="16" stroke="currentColor" strokeWidth="2"/>
      <line x1="32" y1="40" x2="32" y2="48" stroke="currentColor" strokeWidth="2"/>
    </svg>
  );
}

function MapIcon() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
      <path d="M12 16 L24 12 L40 20 L52 16 L52 48 L40 52 L24 44 L12 48 Z" stroke="currentColor" strokeWidth="2" fill="none"/>
      <line x1="24" y1="12" x2="24" y2="44" stroke="currentColor" strokeWidth="2"/>
      <line x1="40" y1="20" x2="40" y2="52" stroke="currentColor" strokeWidth="2"/>
    </svg>
  );
}

function StorageIcon() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
      <rect x="12" y="16" width="40" height="12" rx="2" stroke="currentColor" strokeWidth="2" fill="none"/>
      <rect x="12" y="32" width="40" height="12" rx="2" stroke="currentColor" strokeWidth="2" fill="none"/>
      <circle cx="20" cy="22" r="2" fill="currentColor"/>
      <circle cx="20" cy="38" r="2" fill="currentColor"/>
    </svg>
  );
}

function MusicIcon() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
      <path d="M24 40 L24 20 L44 16 L44 36" stroke="currentColor" strokeWidth="2" fill="none"/>
      <circle cx="20" cy="44" r="6" stroke="currentColor" strokeWidth="2" fill="none"/>
      <circle cx="40" cy="40" r="6" stroke="currentColor" strokeWidth="2" fill="none"/>
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
      <circle cx="32" cy="24" r="10" stroke="currentColor" strokeWidth="2" fill="none"/>
      <path d="M16 52 C16 42 22 36 32 36 C42 36 48 42 48 52" stroke="currentColor" strokeWidth="2" fill="none"/>
    </svg>
  );
}

function PdfIcon() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
      <path d="M20 12 L44 12 L52 20 L52 52 L20 52 Z" stroke="currentColor" strokeWidth="2" fill="none"/>
      <path d="M44 12 L44 20 L52 20" stroke="currentColor" strokeWidth="2" fill="none"/>
      <text x="32" y="38" textAnchor="middle" fill="currentColor" fontSize="12" fontWeight="600">PDF</text>
    </svg>
  );
}

function PhotoIcon() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
      <rect x="12" y="16" width="40" height="32" rx="2" stroke="currentColor" strokeWidth="2" fill="none"/>
      <circle cx="24" cy="28" r="4" stroke="currentColor" strokeWidth="2" fill="none"/>
      <path d="M12 40 L24 28 L36 40 L48 28 L52 32" stroke="currentColor" strokeWidth="2" fill="none"/>
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
      <circle cx="20" cy="32" r="6" stroke="currentColor" strokeWidth="2" fill="none"/>
      <circle cx="44" cy="20" r="6" stroke="currentColor" strokeWidth="2" fill="none"/>
      <circle cx="44" cy="44" r="6" stroke="currentColor" strokeWidth="2" fill="none"/>
      <line x1="25" y1="30" x2="39" y2="22" stroke="currentColor" strokeWidth="2"/>
      <line x1="25" y1="34" x2="39" y2="42" stroke="currentColor" strokeWidth="2"/>
    </svg>
  );
}

function TaskIcon() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
      <rect x="16" y="12" width="32" height="40" rx="2" stroke="currentColor" strokeWidth="2" fill="none"/>
      <path d="M24 24 L28 28 L36 20" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="24" y1="36" x2="40" y2="36" stroke="currentColor" strokeWidth="2"/>
      <line x1="24" y1="44" x2="40" y2="44" stroke="currentColor" strokeWidth="2"/>
    </svg>
  );
}

function CloudIcon() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
      <path d="M20 40 C14 40 10 36 10 30 C10 24 14 20 20 20 C20 14 26 10 32 10 C38 10 44 14 44 20 C50 20 54 24 54 30 C54 36 50 40 44 40 Z" stroke="currentColor" strokeWidth="2" fill="none"/>
    </svg>
  );
}

function WikiIcon() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
      <rect x="16" y="12" width="32" height="40" rx="2" stroke="currentColor" strokeWidth="2" fill="none"/>
      <line x1="24" y1="24" x2="40" y2="24" stroke="currentColor" strokeWidth="2"/>
      <line x1="24" y1="32" x2="40" y2="32" stroke="currentColor" strokeWidth="2"/>
      <line x1="24" y1="40" x2="36" y2="40" stroke="currentColor" strokeWidth="2"/>
      <circle cx="44" cy="44" r="8" fill="currentColor"/>
      <text x="44" y="48" textAnchor="middle" fill="white" fontSize="10" fontWeight="600">W</text>
    </svg>
  );
}

function WorkflowIcon() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
      <rect x="12" y="12" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="2" fill="none"/>
      <rect x="40" y="12" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="2" fill="none"/>
      <rect x="26" y="40" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="2" fill="none"/>
      <path d="M24 18 L32 18 L32 40" stroke="currentColor" strokeWidth="2" fill="none"/>
      <path d="M40 18 L32 18" stroke="currentColor" strokeWidth="2" fill="none"/>
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
      <path d="M12 32 L32 12 L52 32 L52 52 L12 52 Z" stroke="currentColor" strokeWidth="2" fill="none"/>
      <rect x="28" y="36" width="8" height="16" fill="currentColor"/>
    </svg>
  );
}

function DefaultIcon() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
      <rect x="16" y="16" width="32" height="32" rx="4" stroke="currentColor" strokeWidth="2" fill="none"/>
      <circle cx="32" cy="32" r="8" stroke="currentColor" strokeWidth="2" fill="none"/>
    </svg>
  );
}

// Icon resolver for Quick Links
function getIconByName(iconName) {
  switch (iconName) {
    case 'vault': return <VaultIcon />;
    case 'key': return <KeyIcon />;
    case 'gitops': return <GitOpsIcon />;
    case 'terminal': return <TerminalIcon />;
    case 'clock': return <ClockIcon />;
    case 'chart': return <ChartIcon />;
    case 'activity': return <ActivityIcon />;
    case 'portal': return <PortalIcon />;
    case 'note': return <NoteIcon />;
    case 'chat': return <ChatIcon />;
    case 'content': return <ContentIcon />;
    case 'code': return <CodeIcon />;
    case 'book': return <BookIcon />;
    case 'folder': return <FolderIcon />;
    case 'k8s': return <K8sIcon />;
    case 'map': return <MapIcon />;
    case 'storage': return <StorageIcon />;
    case 'music': return <MusicIcon />;
    case 'user': return <UserIcon />;
    case 'pdf': return <PdfIcon />;
    case 'photo': return <PhotoIcon />;
    case 'share': return <ShareIcon />;
    case 'task': return <TaskIcon />;
    case 'cloud': return <CloudIcon />;
    case 'wiki': return <WikiIcon />;
    case 'workflow': return <WorkflowIcon />;
    case 'home': return <HomeIcon />;
    default: return <DefaultIcon />;
  }
}

// Service icon component
// Bookmarks panel
const loadBookmarkData = signal => requestJson('/api/bookmarks', { signal });
const selectQuickLinks = data => (data.categories || [])
  .flatMap(category => category.bookmarks || [])
  .filter(bookmark => bookmark.quickLink && getSafeExternalUrl(bookmark.url));

function QuickLinksPanel({ isOpen, onClose }) {
  const [quickLinks, setQuickLinks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen) return undefined;
    const controller = new AbortController();
    loadBookmarkData(controller.signal)
      .then(data => setQuickLinks(selectQuickLinks(data)))
      .catch(err => {
        if (err.name !== 'AbortError') console.error('Failed to fetch quick links:', err);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [isOpen]);

  return (
    <div className={`quicklinks-panel${isOpen ? ' open' : ''}`}>
      <div className="quicklinks-header">
        <div className="quicklinks-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          Quick Links
        </div>
        <button className="quicklinks-close" onClick={onClose}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div className="quicklinks-list">
        {loading && <LoadingProgress label="Quick Links를 불러오는 중입니다." detail="즐겨찾기에서 고정 항목을 확인하고 있습니다." compact />}
        {!loading && quickLinks.length === 0 && (
          <div className="quicklinks-empty">
            No quick links yet.<br/>
            <span className="quicklinks-hint">Mark bookmarks as Quick Link in the Bookmarks panel.</span>
          </div>
        )}
        {quickLinks.map(bm => (
          <a key={bm.id} href={getSafeExternalUrl(bm.url) || '#'} target="_blank" rel="noopener noreferrer" className="quicklink-item" style={{ '--ql-color': bm.color }}>
            <div className="quicklink-icon">
              {getIconByName(bm.icon)}
            </div>
            <div className="quicklink-info">
              <span className="quicklink-name">{bm.name}</span>
              <span className="quicklink-url">{bm.url.replace(/^https?:\/\//, '').slice(0, 28)}</span>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

function SearchBar() {
  return <SharedGoogleSearch variant="classic" />;
}

function ServicesModal() {
  return <ServiceHub initialTab="services" />;
}

// Footer component
function Footer() {
  return (
    <footer className="app-footer">
      <div className="footer-content">
        <span className="footer-text">
          Craft by seon (
          <a href="mailto:dark.pearl.nst@gmail.com" className="footer-link">
            dark.pearl.nst@gmail.com
          </a>
          )
        </span>
        <span className="footer-divider">|</span>
        <span className="footer-text">React + Vite</span>
        <span className="footer-divider">|</span>
        <span className="footer-text">v{APP_VERSION}</span>
      </div>
    </footer>
  );
}

function ClassicDashboard({ colorMode }) {
  const [activeModal, setActiveModal] = useState(null);
  const [activeToolId, setActiveToolId] = useState(null);
  const [showQuickLinks, setShowQuickLinks] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [mobileTopSheetOpen, setMobileTopSheetOpen] = useState(false);
  const drawerRef = useRef(null);
  const topSheetRef = useRef(null);
  const touchStartY = useRef(0);
  const touchCurrentY = useRef(0);
  const isDragging = useRef(false);
  const topSheetTouchStartY = useRef(0);
  const topSheetIsDragging = useRef(false);
  const [cursorEffect, setCursorEffect] = usePersistentPreference('cursorGlow');
  const [cursorAnim, setCursorAnim] = usePersistentPreference('cursorAnimation');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsPos, setSettingsPos] = useState({ right: 84, bottom: 24 });
  const settingsBtnRef = useRef(null);
  const [toolsExpanded, setToolsExpanded] = useState(false);
  const [toolSearch, setToolSearch] = useState('');
  const filteredTools = filterToolCatalog(WEB_TOOL_CATALOG, toolSearch);
  const visibleToolIds = new Set(filteredTools.map((tool) => tool.id));
  const calendarVisible = 'calendar'.includes(toolSearch.trim().toLowerCase());
  const toolMatchCount = filteredTools.filter((tool) => TOOL_GRID_IDS.has(tool.id)).length + (calendarVisible ? 1 : 0);
  const activeTool = getWebTool(activeToolId);
  const ActiveToolComponent = activeTool?.component || null;
  const transitionSurface = (update) => update();

  const openModal = (name) => {
    transitionSurface(() => {
      setActiveToolId(null);
      setToolsExpanded(false);
      setActiveModal(name);
      setMobileDrawerOpen(false);
    });
  };
  const closeModal = () => transitionSurface(() => setActiveModal(null));

  const openTool = (toolId) => {
    const next = openToolDialog({ toolsExpanded, activeToolId, activeModal }, toolId);
    transitionSurface(() => {
      setToolsExpanded(next.toolsExpanded);
      setActiveToolId(next.activeToolId);
      setActiveModal(next.activeModal);
      setMobileDrawerOpen(false);
    });
  };

  const openToolsLauncher = () => {
    const next = openToolLauncher({ toolsExpanded, activeToolId, activeModal });
    transitionSurface(() => {
      setToolSearch('');
      setToolsExpanded(next.toolsExpanded);
      setActiveToolId(next.activeToolId);
      setActiveModal(next.activeModal);
      setMobileDrawerOpen(false);
    });
  };

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        if (activeToolId || toolsExpanded || activeModal) {
          const next = closeTopDialog({ toolsExpanded, activeToolId, activeModal });
          transitionSurface(() => {
            setToolsExpanded(next.toolsExpanded);
            setActiveToolId(next.activeToolId);
            setActiveModal(next.activeModal);
          });
        } else if (showQuickLinks) {
          setShowQuickLinks(false);
        }
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [activeModal, activeToolId, showQuickLinks, toolsExpanded]);

  // Mobile drawer touch handlers
  const handleDrawerTouchStart = (e) => {
    touchStartY.current = e.touches[0].clientY;
    touchCurrentY.current = e.touches[0].clientY;
    isDragging.current = true;
    if (drawerRef.current) drawerRef.current.style.transition = 'none';
  };
  const handleDrawerTouchMove = (e) => {
    if (!isDragging.current) return;
    touchCurrentY.current = e.touches[0].clientY;
    const diff = touchStartY.current - touchCurrentY.current;
    if (drawerRef.current) {
      const drawerHeight = drawerRef.current.scrollHeight;
      const peekHeight = 48;
      const maxTranslate = drawerHeight - peekHeight;
      let translate;
      if (mobileDrawerOpen) {
        translate = Math.max(0, Math.min(maxTranslate, -diff));
      } else {
        translate = Math.max(0, Math.min(maxTranslate, maxTranslate - diff));
      }
      drawerRef.current.style.transform = `translateY(${translate}px)`;
    }
  };
  const handleDrawerTouchEnd = () => {
    if (!isDragging.current) return;
    isDragging.current = false;
    const diff = touchStartY.current - touchCurrentY.current;
    if (drawerRef.current) drawerRef.current.style.transition = '';
    if (drawerRef.current) drawerRef.current.style.transform = '';
    if (!mobileDrawerOpen && diff > 50) {
      setMobileDrawerOpen(true);
    } else if (mobileDrawerOpen && diff < -50) {
      setMobileDrawerOpen(false);
    }
  };

  // Top sheet touch to close (swipe up)
  const handleTopSheetTouchStart = (e) => {
    topSheetTouchStartY.current = e.touches[0].clientY;
    topSheetIsDragging.current = true;
  };
  const handleTopSheetTouchEnd = (e) => {
    if (!topSheetIsDragging.current) return;
    topSheetIsDragging.current = false;
    const diff = e.changedTouches[0].clientY - topSheetTouchStartY.current;
    if (diff < -50) {
      setMobileTopSheetOpen(false);
    }
  };

  // Global swipe detection (top sheet + bottom drawer)
  useEffect(() => {
    const isMobile = () => window.innerWidth <= 768;
    let startY = 0;
    let startX = 0;

    const onStart = (e) => {
      const touch = e.touches ? e.touches[0] : e;
      startY = touch.clientY;
      startX = touch.clientX;
    };

    const onEnd = (e) => {
      if (!isMobile()) return;
      const touch = e.changedTouches ? e.changedTouches[0] : e;
      const diffY = touch.clientY - startY;
      const diffX = Math.abs(touch.clientX - startX);
      if (diffX > 100) return; // not vertical

      // Swipe UP from bottom half → open bottom drawer
      if (diffY < -60 && startY > window.innerHeight * 0.5
          && !mobileDrawerOpen && !mobileTopSheetOpen && !activeModal) {
        setMobileDrawerOpen(true);
      }
    };

    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchend', onEnd, { passive: true });
    window.addEventListener('mousedown', onStart);
    window.addEventListener('mouseup', onEnd);
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('mousedown', onStart);
      window.removeEventListener('mouseup', onEnd);
    };
  }, [mobileDrawerOpen, mobileTopSheetOpen, activeModal]);

  return (
    <div className={`dashboard-wrapper${showQuickLinks ? ' quicklinks-open' : ''}`} data-dashboard-layout="classic" data-color-mode={colorMode}>
      <QuickLinksPanel isOpen={showQuickLinks} onClose={() => setShowQuickLinks(false)} />
    <div className="dashboard">
      <CursorGlow effect={cursorEffect} />
      <CursorCanvas effect={cursorAnim} />

      {/* Mobile Top Sheet - swipe down from top */}
      {mobileTopSheetOpen && <div className="mobile-drawer-overlay" onClick={() => setMobileTopSheetOpen(false)} />}
      <div
        className={`mobile-top-sheet${mobileTopSheetOpen ? ' top-sheet-open' : ''}`}
        ref={topSheetRef}
        onTouchStart={handleTopSheetTouchStart}
        onTouchEnd={handleTopSheetTouchEnd}
      >
        <div className="top-sheet-content">
          <WeatherWidget onClick={() => { setMobileTopSheetOpen(false); openModal('weather'); }} />
          <div className="bar-divider"></div>
          <ExchangeWidget onClick={() => { setMobileTopSheetOpen(false); openModal('exchange'); }} />
        </div>
        <div className="top-sheet-search">
          <SearchBar />
        </div>
        <div className="mobile-drawer-handle" onClick={() => setMobileTopSheetOpen(false)}>
          <div className="drawer-handle-bar" />
        </div>
      </div>

      {/* Mobile Drawer Overlay */}
      {mobileDrawerOpen && <div className="mobile-drawer-overlay" onClick={() => setMobileDrawerOpen(false)} />}

      {/* Bottom Right Stack / Mobile Drawer */}
      <div
        className={`bottom-right-stack${mobileDrawerOpen ? ' drawer-open' : ''}`}
        ref={drawerRef}
        onTouchStart={handleDrawerTouchStart}
        onTouchMove={handleDrawerTouchMove}
        onTouchEnd={handleDrawerTouchEnd}
      >

      {/* Drawer Handle (mobile only) */}
      <div className="mobile-drawer-handle" onClick={() => setMobileDrawerOpen(!mobileDrawerOpen)}>
        <div className="drawer-handle-bar" />
      </div>

      {/* Infrastructure Dashboard Button */}
      <button className={`tools-toggle-btn${activeToolId === 'infra' ? ' expanded' : ''}`} onClick={() => openTool('infra')}>
        <span className="tools-toggle-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="4" rx="1" /><path d="M12 7v4" /><path d="M6 11h12" /><path d="M6 11v4" /><path d="M18 11v4" /><path d="M12 11v4" />
            <rect x="2" y="15" width="6" height="4" rx="1" /><rect x="9" y="15" width="6" height="4" rx="1" /><rect x="16" y="15" width="6" height="4" rx="1" />
          </svg>
        </span>
        <span className="tools-toggle-label">Infra</span>
      </button>

      {/* Repository Catalog Button */}
      <button className={`tools-toggle-btn${activeToolId === 'repos' ? ' expanded' : ''}`} onClick={() => openTool('repos')}>
        <span className="tools-toggle-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3h7v7H3z" /><path d="M14 3h7v7h-7z" /><path d="M14 14h7v7h-7z" /><path d="M3 14h7v7H3z" />
          </svg>
        </span>
        <span className="tools-toggle-label">Repos</span>
      </button>

      {/* NAS File Browser Button */}
      <button className={`tools-toggle-btn${activeToolId === 'nas' ? ' expanded' : ''}`} onClick={() => openTool('nas')}>
        <span className="tools-toggle-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
        </span>
        <span className="tools-toggle-label">NAS</span>
      </button>

      {/* Google Drive Button */}
      <button className={`tools-toggle-btn${activeToolId === 'gdrive' ? ' expanded' : ''}`} onClick={() => openTool('gdrive')}>
        <span className="tools-toggle-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4285f4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 19.5h20L12 2z" /><path d="M12 2l8.5 17.5" /><path d="M2 19.5h17" />
          </svg>
        </span>
        <span className="tools-toggle-label">GDrive</span>
      </button>

      {/* OneDrive Button */}
      <button className={`tools-toggle-btn${activeToolId === 'onedrive' ? ' expanded' : ''}`} onClick={() => openTool('onedrive')}>
        <span className="tools-toggle-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0078d4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
          </svg>
        </span>
        <span className="tools-toggle-label">OneDrive</span>
      </button>

      {/* App Icon Grid Toggle */}
      <button className={`tools-toggle-btn${toolsExpanded ? ' expanded' : ''}`} onClick={openToolsLauncher}>
        <span className="tools-toggle-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
        </span>
        <span className="tools-toggle-label">Tools</span>
      </button>

      {/* Cursor effects settings (페이지 전체 설정: glow 색 / 커서 애니메이션) */}
      <div className="cursor-settings-wrap">
        <button
          ref={settingsBtnRef}
          className={`tools-toggle-btn${settingsOpen ? ' expanded' : ''}`}
          title="Cursor Effects"
          onClick={() => {
            if (!settingsOpen && settingsBtnRef.current) {
              const r = settingsBtnRef.current.getBoundingClientRect();
              setSettingsPos({ right: Math.round(window.innerWidth - r.left + 12), bottom: Math.round(window.innerHeight - r.bottom) });
            }
            setSettingsOpen(!settingsOpen);
          }}
        >
          <span className="tools-toggle-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </span>
          <span className="tools-toggle-label">Effects</span>
        </button>
      </div>
      {settingsOpen && createPortal((
        <div className="cursor-settings-overlay" onClick={() => setSettingsOpen(false)}>
          <div className="cursor-settings-popover" style={{ right: settingsPos.right, bottom: settingsPos.bottom }} onClick={(e) => e.stopPropagation()}>
            <div className="glow-picker-dropdown">
              <div className="glow-picker-label">Glow Color</div>
              {CURSOR_GLOW_EFFECTS.map(e => (
                <button
                  key={e.id}
                  className={`glow-option${cursorEffect === e.id ? ' active' : ''}`}
                  onClick={() => setCursorEffect(e.id)}
                >
                  <span className={`glow-swatch glow-swatch-${e.id}`} />
                  <span>{e.name}</span>
                </button>
              ))}
            </div>
            <div className="glow-picker-dropdown">
              <div className="glow-picker-label">Animation</div>
              {CURSOR_ANIMATIONS.map(e => (
                <button
                  key={e.id}
                  className={`glow-option${cursorAnim === e.id ? ' active' : ''}`}
                  onClick={() => setCursorAnim(e.id)}
                >
                  <span className="glow-swatch" style={{ background: e.color, border: e.id === 'none' ? '1px solid rgba(255,255,255,0.2)' : 'none' }} />
                  <span>{e.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ), document.body)}

      {/* Tools full-screen modal (portal: bottom-right-stack의 transform 영향에서 벗어나기 위해 body로 렌더) */}
      {toolsExpanded && createPortal((
      <div className="tools-modal-overlay" onClick={() => transitionSurface(() => setToolsExpanded(false))}>
        <div className="tools-modal" role="dialog" aria-modal="true" aria-labelledby="classic-tools-title" onClick={(e) => e.stopPropagation()}>
          <div className="tools-modal-header">
            <span className="tools-modal-title" id="classic-tools-title">Tools</span>
            <div className="tools-modal-search-wrap">
              <svg className="tools-modal-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                className="tools-modal-search"
                type="text"
                autoFocus
                aria-label="도구 검색"
                placeholder="도구 검색..."
                value={toolSearch}
                onChange={(e) => setToolSearch(e.target.value)}
              />
              {toolSearch && (
                <button className="tools-modal-search-clear" onClick={() => setToolSearch('')} aria-label="검색 지우기">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              )}
            </div>
            <button className="tools-modal-close" onClick={() => transitionSurface(() => setToolsExpanded(false))} aria-label="닫기">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
          <div className="tools-modal-grid">
        <button className="app-icon-btn" hidden={!calendarVisible} onClick={() => openModal('calendar')} title="Calendar">
          <span className="app-icon-visual">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </span>
          <span className="app-icon-label">Calendar</span>
        </button>

        <button className="app-icon-btn" hidden={!visibleToolIds.has('notes')} onClick={() => openTool('notes')} title="Notes">
          <span className="app-icon-visual">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
            </svg>
          </span>
          <span className="app-icon-label">Notes</span>
        </button>

        <button className="app-icon-btn" hidden={!visibleToolIds.has('markdown')} onClick={() => openTool('markdown')} title="Markdown">
          <span className="app-icon-visual">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
            </svg>
          </span>
          <span className="app-icon-label">Markdown</span>
        </button>

        <button className="app-icon-btn" hidden={!visibleToolIds.has('chat')} onClick={() => openTool('chat')} title="AI Chat">
          <span className="app-icon-visual">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </span>
          <span className="app-icon-label">AI Chat</span>
        </button>

        <button className="app-icon-btn" hidden={!visibleToolIds.has('unit')} onClick={() => openTool('unit')} title="Unit Converter">
          <span className="app-icon-visual">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" />
              <polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
            </svg>
          </span>
          <span className="app-icon-label">Converter</span>
        </button>

        <button className="app-icon-btn" hidden={!visibleToolIds.has('base64')} onClick={() => openTool('base64')} title="Base64">
          <span className="app-icon-visual">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2" /><path d="M7 15h0M2 9.5h20" />
            </svg>
          </span>
          <span className="app-icon-label">Base64</span>
        </button>

        <button className="app-icon-btn" hidden={!visibleToolIds.has('json')} onClick={() => openTool('json')} title="JSON Formatter">
          <span className="app-icon-visual">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1" />
              <path d="M16 3h1a2 2 0 0 1 2 2v5a2 2 0 0 0 2 2 2 2 0 0 0-2 2v5a2 2 0 0 1-2 2h-1" />
            </svg>
          </span>
          <span className="app-icon-label">JSON</span>
        </button>

        <button className="app-icon-btn" hidden={!visibleToolIds.has('ip')} onClick={() => openTool('ip')} title="IP Lookup">
          <span className="app-icon-visual">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
          </span>
          <span className="app-icon-label">IP</span>
        </button>

        <button className="app-icon-btn" hidden={!visibleToolIds.has('password')} onClick={() => openTool('password')} title="Password Generator">
          <span className="app-icon-visual">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </span>
          <span className="app-icon-label">PW</span>
        </button>

        <button className="app-icon-btn" hidden={!visibleToolIds.has('color')} onClick={() => openTool('color')} title="Color Picker">
          <span className="app-icon-visual">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="13.5" cy="6.5" r="2.5" />
              <path d="M17.545 11.009A8 8 0 1 1 12.68 3.027" />
              <circle cx="7" cy="13" r="1.5" fill="currentColor" />
              <circle cx="11" cy="17" r="1.5" fill="currentColor" />
              <circle cx="16" cy="14.5" r="1.5" fill="currentColor" />
            </svg>
          </span>
          <span className="app-icon-label">Color</span>
        </button>

        <button className="app-icon-btn" hidden={!visibleToolIds.has('cron')} onClick={() => openTool('cron')} title="Cron Editor">
          <span className="app-icon-visual">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </span>
          <span className="app-icon-label">Cron</span>
        </button>

        <button className="app-icon-btn" hidden={!visibleToolIds.has('subnet')} onClick={() => openTool('subnet')} title="CIDR / Subnet Visualizer">
          <span className="app-icon-visual">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="4" rx="1" />
              <path d="M12 7v4" />
              <path d="M6 11h12" />
              <path d="M6 11v4" />
              <path d="M18 11v4" />
              <path d="M12 11v4" />
              <rect x="2" y="15" width="6" height="4" rx="1" />
              <rect x="9" y="15" width="6" height="4" rx="1" />
              <rect x="16" y="15" width="6" height="4" rx="1" />
            </svg>
          </span>
          <span className="app-icon-label">CIDR</span>
        </button>

        <button className="app-icon-btn" hidden={!visibleToolIds.has('slo')} onClick={() => openTool('slo')} title="SLO / SLI Calculator">
          <span className="app-icon-visual">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20V10" /><path d="M18 20V4" /><path d="M6 20v-4" />
            </svg>
          </span>
          <span className="app-icon-label">SLO</span>
        </button>

        <button className="app-icon-btn" hidden={!visibleToolIds.has('cicd')} onClick={() => openTool('cicd')} title="CI/CD Pipeline Visualizer">
          <span className="app-icon-visual">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 3v6M12 15v6M3 12h6M15 12h6" />
              <path d="M5.636 5.636l4.243 4.243M14.121 14.121l4.243 4.243" />
            </svg>
          </span>
          <span className="app-icon-label">CI/CD</span>
        </button>

        <button className="app-icon-btn" hidden={!visibleToolIds.has('excel')} onClick={() => openTool('excel')} title="Excel → Markdown Table">
          <span className="app-icon-visual">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
            </svg>
          </span>
          <span className="app-icon-label">Excel→MD</span>
        </button>

        <button className="app-icon-btn" hidden={!visibleToolIds.has('rbac')} onClick={() => openTool('rbac')} title="RBAC Visualizer">
          <span className="app-icon-visual">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
          </span>
          <span className="app-icon-label">RBAC</span>
        </button>

        <button className="app-icon-btn" hidden={!visibleToolIds.has('terraform')} onClick={() => openTool('terraform')} title="Terraform State Parser">
          <span className="app-icon-visual">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </span>
          <span className="app-icon-label">Terraform</span>
        </button>

        <button className="app-icon-btn" hidden={!visibleToolIds.has('gl2gh')} onClick={() => openTool('gl2gh')} title="GitLab CI → GitHub Actions">
          <span className="app-icon-visual">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2" />
              <line x1="12" y1="22" x2="12" y2="15.5" />
              <polyline points="22 8.5 12 15.5 2 8.5" />
            </svg>
          </span>
          <span className="app-icon-label">GL→GH</span>
        </button>

        <button className="app-icon-btn" hidden={!visibleToolIds.has('archicon')} onClick={() => openTool('archicon')} title="Architecture Icon Search">
          <span className="app-icon-visual">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
          </span>
          <span className="app-icon-label">Arch Icons</span>
        </button>

        <button className="app-icon-btn" hidden={!visibleToolIds.has('regex')} onClick={() => openTool('regex')} title="Regex Tester">
          <span className="app-icon-visual">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
            </svg>
          </span>
          <span className="app-icon-label">Regex</span>
        </button>

        <button className="app-icon-btn" hidden={!visibleToolIds.has('epoch')} onClick={() => openTool('epoch')} title="Epoch Converter">
          <span className="app-icon-visual">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
              <path d="M2 12h2" /><path d="M20 12h2" />
            </svg>
          </span>
          <span className="app-icon-label">Epoch</span>
        </button>

        <button className="app-icon-btn" hidden={!visibleToolIds.has('textcounter')} onClick={() => openTool('textcounter')} title="Text Counter">
          <span className="app-icon-visual">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
            </svg>
          </span>
          <span className="app-icon-label">TextCnt</span>
        </button>

        <button className="app-icon-btn" hidden={!visibleToolIds.has('dns')} onClick={() => openTool('dns')} title="DNS Lookup">
          <span className="app-icon-visual">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </span>
          <span className="app-icon-label">DNS</span>
        </button>

        <button className="app-icon-btn" hidden={!visibleToolIds.has('mermaid')} onClick={() => openTool('mermaid')} title="Mermaid Editor">
          <span className="app-icon-visual">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
            </svg>
          </span>
          <span className="app-icon-label">Mermaid</span>
        </button>

          </div>{/* end tools-modal-grid */}
          {toolMatchCount === 0 && toolSearch && (
            <div className="tools-modal-empty">"{toolSearch}" 검색 결과가 없습니다</div>
          )}
        </div>{/* end tools-modal */}
      </div>
      ), document.body)}

      </div>{/* end bottom-right-stack */}

      {/* Top Left - SEONOLOGY Title */}
      <div className="top-left-bar">
        <button className="seonology-btn" onClick={() => openModal('services')}>
          <span className="seonology-accent" />
          <span className="seonology-text">SEONOLOGY</span>
          <span className="seonology-sub">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
            </svg>
            Services
          </span>
        </button>
        <button className={`quicklinks-toggle${showQuickLinks ? ' active' : ''}`} onClick={() => setShowQuickLinks(!showQuickLinks)} title="Quick Links">
          <svg width="14" height="14" viewBox="0 0 24 24" fill={showQuickLinks ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          <span>Quick Links</span>
        </button>
      </div>

      {/* Top Center - Weather & Exchange */}
      <div className="top-center-bar">
        <WeatherWidget onClick={() => openModal('weather')} />
        <div className="bar-divider"></div>
        <ExchangeWidget onClick={() => openModal('exchange')} />
      </div>

      {/* Top Right - Browser Stats */}
      <BrowserStats />

      {/* Main Clock */}
      <main className="main-content">
        <Clock />
        <div className="quick-shortcuts-wrapper">
          <div className="quick-shortcuts">
            <a href="https://mail.google.com" target="_blank" rel="noopener noreferrer" className="shortcut-link" title="Gmail">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="2" /><path d="M22 7l-10 7L2 7" />
              </svg>
            </a>
            <a href="https://papago.naver.com" target="_blank" rel="noopener noreferrer" className="shortcut-link" title="Papago">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 8l6 6" /><path d="M4 14l6-6 2-3" /><path d="M2 5h12" /><path d="M7 2h1" />
                <path d="M22 22l-5-10-5 10" /><path d="M14 18h6" />
              </svg>
            </a>
            <a href="https://claude.ai" target="_blank" rel="noopener noreferrer" className="shortcut-link" title="Claude">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                <path d="M8 10h.01" /><path d="M12 10h.01" /><path d="M16 10h.01" />
              </svg>
            </a>
            <a href="https://gemini.google.com" target="_blank" rel="noopener noreferrer" className="shortcut-link" title="Gemini">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
                <path d="M12 2v10l7 4" />
              </svg>
            </a>
            <a href="https://www.youtube.com" target="_blank" rel="noopener noreferrer" className="shortcut-link" title="YouTube">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19.1c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.43z" />
                <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" />
              </svg>
            </a>
            <button className="shortcut-link top-sheet-toggle-btn" onClick={() => setMobileTopSheetOpen(!mobileTopSheetOpen)} title="Weather & Info">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v2" /><path d="M12 20v2" /><path d="M4.93 4.93l1.41 1.41" /><path d="M17.66 17.66l1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="M6.34 17.66l-1.41 1.41" /><path d="M19.07 4.93l-1.41 1.41" />
                <circle cx="12" cy="12" r="5" />
              </svg>
            </button>
          </div>
          <div className="quick-shortcuts quick-shortcuts-apps">
            <a href="vscode://" className="shortcut-link" title="VS Code">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16.5 2.5L8 11l-4.5-3.5L2 8.5v7l1.5 1 4.5-3.5 8.5 8.5 4-1.5v-16z" />
                <path d="M20.5 3.5v17" />
              </svg>
            </a>
            <a href="jetbrains://idea/" className="shortcut-link" title="IntelliJ IDEA">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M7 17h6" />
                <path d="M7 7h2v6H7z" fill="currentColor" stroke="none" />
                <path d="M12 7h2.5a2.5 2.5 0 0 1 0 5H12V7z" />
              </svg>
            </a>
            <a href="notion://" className="shortcut-link" title="Notion">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h10l6 6v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4z" />
                <path d="M14 4v6h6" />
                <path d="M8 13h8" /><path d="M8 17h5" />
              </svg>
            </a>
            <a href="kiro://" className="shortcut-link" title="Kiro">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
            </a>
            <a href="antigravity://" className="shortcut-link" title="Anti Gravity">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v8" /><path d="M8 12l4-4 4 4" />
              </svg>
            </a>
          </div>
        </div>
        <SpeedTestMini onClick={() => openTool('speedtest')} />
        <SearchBar />
      </main>

      {/* Bottom Left - Todo Preview */}
      <TodoPreview onClick={() => openModal('todo')} />



      {ActiveToolComponent && (
        <Suspense fallback={<div className="tool-loading-overlay"><LoadingProgress label="도구를 불러오는 중입니다." detail="작업 공간을 준비하고 있습니다." /></div>}>
          <ActiveToolComponent
            isOpen
            onClose={() => transitionSurface(() => setActiveToolId(null))}
            {...(activeTool.props || {})}
          />
        </Suspense>
      )}

      {/* Modals */}
      <Modal isOpen={activeModal === 'services'} onClose={closeModal} title="SEONOLOGY">
        <ServicesModal />
      </Modal>

      <Modal isOpen={activeModal === 'weather'} onClose={closeModal} title="Weather">
        <Weather />
      </Modal>

      <Modal isOpen={activeModal === 'exchange'} onClose={closeModal} title="Exchange Rate">
        <ExchangeRate />
      </Modal>

      <Modal isOpen={activeModal === 'todo'} onClose={closeModal} title="Todo">
        <TodoList />
      </Modal>

      <Modal isOpen={activeModal === 'calendar'} onClose={closeModal} title="Calendar">
        <Calendar />
      </Modal>

      {/* Footer */}
      <Footer />
    </div>
    </div>
  );
}

export default ClassicDashboard;
