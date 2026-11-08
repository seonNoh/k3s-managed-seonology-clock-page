import { useLayoutEffect } from 'react';
import { setUnsavedChangesProbe } from '../api/client.js';

export function useUnsavedChanges(dirty) {
  useLayoutEffect(() => setUnsavedChangesProbe(() => dirty), [dirty]);
}
