export function startUiTransition(update) {
  const reducedMotion = typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const startViewTransition = typeof document !== 'undefined'
    ? document.startViewTransition
    : undefined;

  if (reducedMotion || typeof startViewTransition !== 'function') {
    update();
    return null;
  }

  return startViewTransition.call(document, update);
}
