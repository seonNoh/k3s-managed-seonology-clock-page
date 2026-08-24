const CRYSTALS = Object.freeze(Array.from({ length: 30 }, (_, index) => Object.freeze({
  id: index,
  x: `${(index * 37) % 101}%`,
  delay: `${-((index * 43) % 120) / 10}s`,
  duration: `${8 + ((index * 29) % 65) / 10}s`,
  drift: `${((index * 17) % 90) - 45}px`,
  scale: `${0.5 + ((index * 13) % 65) / 100}`,
})));

function SnowField({ enabled }) {
  if (!enabled) return null;
  return (
    <div className="snow-field" aria-hidden="true">
      {CRYSTALS.map((crystal) => (
        <i
          key={crystal.id}
          style={{
            '--snow-x': crystal.x,
            '--snow-delay': crystal.delay,
            '--snow-duration': crystal.duration,
            '--snow-drift': crystal.drift,
            '--snow-scale': crystal.scale,
          }}
        />
      ))}
    </div>
  );
}

export default SnowField;
