const PREFIX = 'toolkit:';

export const storage = {
  async get(key, defaultValue = null) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const data = await chrome.storage.local.get(PREFIX + key);
      return data[PREFIX + key] !== undefined ? data[PREFIX + key] : defaultValue;
    } else {
      const data = localStorage.getItem(PREFIX + key);
      try {
        return data !== null ? JSON.parse(data) : defaultValue;
      } catch {
        return data !== null ? data : defaultValue;
      }
    }
  },
  
  async set(key, value) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      await chrome.storage.local.set({ [PREFIX + key]: value });
    } else {
      localStorage.setItem(PREFIX + key, typeof value === 'object' ? JSON.stringify(value) : value);
    }
  }
};

export const getPins = () => storage.get('pins', []);
export const setPins = (pins) => storage.set('pins', pins);
export const getRecent = () => storage.get('recent', []);
export const pushRecent = async (id) => {
  let recent = await getRecent();
  recent = [id, ...recent.filter(x => x !== id)].slice(0, 8);
  await storage.set('recent', recent);
};
export const getSettings = () => storage.get('settings', { theme: 'dark' });
export const setSettings = (settings) => storage.set('settings', settings);
