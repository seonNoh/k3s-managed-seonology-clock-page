export const PREFERENCE_KEYS = Object.freeze({
  layout: 'clock-dashboard-layout',
  colorMode: 'clock-color-mode',
  snowEnabled: 'clock-snow-enabled',
  clockTheme: 'clock-theme',
  wordLanguage: 'clock-word-lang',
  ledStyle: 'clock-led-style',
  ledShape: 'clock-led-shape',
  cursorGlow: 'clock-cursor-effect',
  cursorAnimation: 'clock-cursor-anim',
});

export const DEFAULT_PREFERENCES = Object.freeze({
  layout: 'split',
  colorMode: 'light',
  snowEnabled: true,
  clockTheme: 'digital',
  wordLanguage: 'en',
  ledStyle: 'amber',
  ledShape: 'round',
  cursorGlow: 'indigo',
  cursorAnimation: 'none',
});

const ALLOWED_VALUES = Object.freeze({
  layout: new Set(['split', 'classic']),
  colorMode: new Set(['light', 'dark']),
  clockTheme: new Set([
    'digital', 'analog', 'flip', 'neon', 'binary', 'word',
    'progress', 'swiss', 'matrix', 'dotmatrix', 'ring', 'typography',
  ]),
  wordLanguage: new Set(['en', 'ko', 'ja']),
  ledStyle: new Set(['amber', 'green', 'red', 'cyan', 'blue', 'white']),
  ledShape: new Set(['round', 'square', 'diamond', 'bar', 'segment']),
  cursorGlow: new Set([
    'indigo', 'aurora', 'spotlight', 'warm', 'neon', 'ocean', 'sunset',
    'rose', 'emerald', 'cosmic', 'fire', 'ice', 'glow-none',
  ]),
  cursorAnimation: new Set([
    'none', 'trail', 'comet', 'particles', 'ripple', 'fireflies', 'bubbles',
    'stardust', 'snow', 'magnetic', 'constellation', 'wave', 'spotlight',
  ]),
});

export function normalizePreference(name, value) {
  if (!(name in DEFAULT_PREFERENCES)) {
    throw new TypeError(`Unknown preference: ${name}`);
  }

  if (name === 'snowEnabled') {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return DEFAULT_PREFERENCES.snowEnabled;
  }

  return ALLOWED_VALUES[name].has(value) ? value : DEFAULT_PREFERENCES[name];
}

export function readPreference(storage, name) {
  try {
    const value = storage?.getItem(PREFERENCE_KEYS[name]);
    return normalizePreference(name, value);
  } catch {
    return DEFAULT_PREFERENCES[name];
  }
}

export function writePreference(storage, name, value) {
  const normalized = normalizePreference(name, value);
  try {
    storage?.setItem(PREFERENCE_KEYS[name], String(normalized));
  } catch {
    // Browsers can disable or exhaust localStorage. The in-memory UI state remains valid.
  }
  return normalized;
}
