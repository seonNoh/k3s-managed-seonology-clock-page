const templates = [
  { id: 'digital', name: 'Digital', layout: 'portrait' },
  { id: 'analog', name: 'Orbit', layout: 'square' },
  { id: 'flip', name: 'Flip', layout: 'panorama' },
  { id: 'neon', name: 'Neon', layout: 'portrait' },
  { id: 'binary', name: 'Binary', layout: 'square' },
  { id: 'word', name: 'Word', layout: 'panorama' },
  { id: 'progress', name: 'Progress', layout: 'panorama' },
  { id: 'swiss', name: 'Swiss', layout: 'square' },
  { id: 'matrix', name: 'Matrix', layout: 'panorama' },
  { id: 'dotmatrix', name: 'LED', layout: 'portrait' },
  { id: 'ring', name: 'Ring', layout: 'square' },
  { id: 'typography', name: 'Typo', layout: 'panorama' },
];

export const CLOCK_TEMPLATES = Object.freeze(
  templates.map((template) => Object.freeze({ ...template, usesUnitColors: true })),
);

export const CLOCK_TEMPLATE_IDS = Object.freeze(CLOCK_TEMPLATES.map(({ id }) => id));

const TEMPLATES_BY_ID = new Map(CLOCK_TEMPLATES.map((template) => [template.id, template]));

export function getClockTemplate(id) {
  return TEMPLATES_BY_ID.get(id) ?? TEMPLATES_BY_ID.get('digital');
}
