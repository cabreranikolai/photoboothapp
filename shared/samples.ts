import { newLayer, type Template } from './model';
export function sampleTemplate(kind: 'classic' | 'strip' | 'landscape' = 'classic'): Template {
  const strip = kind === 'strip',
    landscape = kind === 'landscape';
  const width = strip ? 600 : landscape ? 1800 : 1200,
    height = landscape ? 1200 : 1800;
  const layers = Array.from({ length: 4 }, (_, i) =>
    newLayer('photo', {
      name: `Photo ${i + 1}`,
      capture: i + 1,
      x: strip ? 45 : 75 + (i % 2) * (landscape ? 840 : 540),
      y: strip ? 70 + i * 380 : 110 + Math.floor(i / 2) * (landscape ? 430 : 660),
      width: strip ? 510 : landscape ? 810 : 510,
      height: strip ? 350 : landscape ? 400 : 620,
      radius: 12,
    }),
  );
  layers.push(
    newLayer('text', {
      name: 'Event title',
      text: 'THE GOOD TIMES',
      x: strip ? 45 : 75,
      y: height - 220,
      width: width - (strip ? 90 : 150),
      height: 90,
      fontSize: strip ? 38 : 66,
      color: '#273a32',
    }),
  );
  layers.push(
    newLayer('text', {
      name: 'Caption',
      text: 'A LITTLE MOMENT. A LIFELONG MEMORY.',
      x: strip ? 45 : 75,
      y: height - 120,
      width: width - (strip ? 90 : 150),
      height: 45,
      fontSize: strip ? 15 : 23,
      color: '#698075',
    }),
  );
  const now = new Date().toISOString();
  return {
    version: 1,
    id: crypto.randomUUID(),
    name: strip ? 'The classic strip' : landscape ? 'Together, always' : 'The good times',
    width,
    height,
    dpi: 300,
    background: '#f4f1e8',
    layers,
    duplicateStrip: false,
    createdAt: now,
    updatedAt: now,
  };
}
