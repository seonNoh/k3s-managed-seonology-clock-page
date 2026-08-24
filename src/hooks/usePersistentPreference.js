import { useCallback, useEffect, useState } from 'react';

import { PREFERENCE_KEYS, readPreference, writePreference } from '../app/preferences.js';

function getBrowserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function usePersistentPreference(name) {
  const [value, setValue] = useState(() => readPreference(getBrowserStorage(), name));

  const updateValue = useCallback((nextValue) => {
    setValue((currentValue) => {
      const resolvedValue = typeof nextValue === 'function' ? nextValue(currentValue) : nextValue;
      return writePreference(getBrowserStorage(), name, resolvedValue);
    });
  }, [name]);

  useEffect(() => {
    const handleStorage = (event) => {
      if (event.key === PREFERENCE_KEYS[name]) {
        setValue(readPreference(getBrowserStorage(), name));
      }
    };
    globalThis.addEventListener?.('storage', handleStorage);
    return () => globalThis.removeEventListener?.('storage', handleStorage);
  }, [name]);

  return [value, updateValue];
}
