import { useEffect, useMemo, useState } from 'react';

import { CURSOR_GLOW_EFFECTS } from './effectCatalog.js';

export default function CursorGlow({ effect, paused = false }) {
  const [position, setPosition] = useState({ x: 50, y: 50 });
  const selectedEffect = useMemo(
    () => CURSOR_GLOW_EFFECTS.find((item) => item.id === effect) ?? CURSOR_GLOW_EFFECTS[0],
    [effect],
  );
  const disabled = selectedEffect.id === 'glow-none';

  useEffect(() => {
    if (disabled || paused) return undefined;

    let frame = 0;
    const updatePosition = (event) => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        setPosition({ x: (event.clientX / window.innerWidth) * 100, y: (event.clientY / window.innerHeight) * 100 });
        frame = 0;
      });
    };
    window.addEventListener('pointermove', updatePosition, { passive: true });
    return () => {
      window.removeEventListener('pointermove', updatePosition);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [disabled, paused]);

  if (disabled) return null;

  return <div className="cursor-glow" data-effect={selectedEffect.id} data-paused={paused || undefined} style={{ background: selectedEffect.gradient(position.x, position.y) }} />;
}
