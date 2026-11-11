import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { compose } from '../electron/composition';
import { newLayer, type Template, templateSchema } from '../shared/model';
import { imagePlacement } from '../shared/geometry';
function template(overrides: Partial<Template> = {}): Template {
  const now = new Date().toISOString();
  return {
    version: 1,
    id: crypto.randomUUID(),
    name: 'Test',
    width: 600,
    height: 1800,
    dpi: 300,
    background: '#ffffff',
    layers: [],
    duplicateStrip: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
async function solid(color: string, width = 100, height = 100) {
  return sharp({ create: { width, height, channels: 4, background: color } })
    .png()
    .toBuffer();
}
async function pixels(bytes: Buffer) {
  const { data, info } = await sharp(bytes)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return (x: number, y: number) => [
    ...data.subarray((y * info.width + x) * 3, (y * info.width + x) * 3 + 3),
  ];
}
describe('print composition uses saved pixel coordinates', () => {
  it('renders exact slot bounds and embeds 300 DPI without scaling', async () => {
    const id = crypto.randomUUID(),
      red = await solid('#ff0000');
    const t = template({
      layers: [newLayer('photo', { assetId: id, x: 45, y: 70, width: 510, height: 350 })],
    });
    const result = await compose(t, async () => red),
      meta = await sharp(result).metadata(),
      at = await pixels(result);
    expect(meta.width).toBe(600);
    expect(meta.height).toBe(1800);
    expect(meta.density).toBe(300);
    expect(at(45, 70)).toEqual([255, 0, 0]);
    expect(at(554, 419)).toEqual([255, 0, 0]);
    expect(at(44, 70)).toEqual([255, 255, 255]);
    expect(at(555, 420)).toEqual([255, 255, 255]);
  });
  it('preserves transparent overlay holes and stacking order', async () => {
    const photoId = crypto.randomUUID(),
      overlayId = crypto.randomUUID();
    const red = await solid('#ff0000'),
      overlay = await sharp(
        Buffer.from(
          '<svg width="100" height="100"><rect width="100" height="20" fill="blue"/></svg>',
        ),
      )
        .png()
        .toBuffer();
    const t = template({
      layers: [
        newLayer('photo', { assetId: photoId, x: 0, y: 0, width: 100, height: 100 }),
        newLayer('image', { assetId: overlayId, x: 0, y: 0, width: 100, height: 100 }),
      ],
    });
    const at = await pixels(await compose(t, async (id) => (id === photoId ? red : overlay)));
    expect(at(50, 10)).toEqual([0, 0, 255]);
    expect(at(50, 50)).toEqual([255, 0, 0]);
  });
  it('uses the same fill and fit geometry as the editor, with manual crop', async () => {
    const id = crypto.randomUUID();
    const source = await sharp(
      Buffer.from(
        '<svg width="200" height="100"><rect width="100" height="100" fill="red"/><rect x="100" width="100" height="100" fill="blue"/></svg>',
      ),
    )
      .png()
      .toBuffer();
    const slot = newLayer('photo', {
      assetId: id,
      x: 20,
      y: 20,
      width: 100,
      height: 100,
      cropX: 1,
    });
    expect(imagePlacement(200, 100, slot)).toEqual({ x: -100, y: 0, width: 200, height: 100 });
    const at = await pixels(await compose(template({ layers: [slot] }), async () => source));
    expect(at(50, 50)).toEqual([0, 0, 255]);
    const fit = await pixels(
      await compose(
        template({ layers: [{ ...slot, fit: 'fit', cropY: 0.5 }] }),
        async () => source,
      ),
    );
    expect(fit(30, 25)).toEqual([255, 255, 255]);
    expect(fit(30, 60)).toEqual([255, 0, 0]);
  });
  it('rotates around the saved top-left origin and clips negative positions', async () => {
    const red = await solid('#ff0000');
    const l = newLayer('photo', {
      assetId: crypto.randomUUID(),
      x: 100,
      y: 40,
      width: 80,
      height: 40,
      rotation: 90,
    });
    const at = await pixels(await compose(template({ layers: [l] }), async () => red));
    expect(at(80, 80)).toEqual([255, 0, 0]);
    expect(at(110, 80)).toEqual([255, 255, 255]);
    const negative = await pixels(
      await compose(template({ layers: [{ ...l, x: -20, y: -10, rotation: 0 }] }), async () => red),
    );
    expect(negative(0, 0)).toEqual([255, 0, 0]);
    expect(negative(60, 0)).toEqual([255, 255, 255]);
  });
  it('honors rounded clips, borders, and hidden layers', async () => {
    const red = await solid('#ff0000');
    const l = newLayer('photo', {
      assetId: crypto.randomUUID(),
      x: 20,
      y: 20,
      width: 100,
      height: 100,
      radius: 30,
      border: 6,
      color: '#0000ff',
    });
    const at = await pixels(
      await compose(
        template({
          layers: [l, { ...l, id: crypto.randomUUID(), visible: false, assetId: undefined }],
        }),
        async () => red,
      ),
    );
    expect(at(20, 20)).toEqual([255, 255, 255]);
    expect(at(70, 22)).toEqual([0, 0, 255]);
    expect(at(70, 70)).toEqual([255, 0, 0]);
  });
  it('duplicates a 2 × 6 strip into an exact 4 × 6 sheet', async () => {
    const t = template({
      duplicateStrip: true,
      layers: [
        newLayer('photo', { assetId: crypto.randomUUID(), x: 50, y: 50, width: 100, height: 100 }),
      ],
    });
    const red = await solid('#ff0000'),
      result = await compose(t, async () => red),
      at = await pixels(result);
    const meta = await sharp(result).metadata();
    expect([meta.width, meta.height, meta.density]).toEqual([1200, 1800, 300]);
    expect(at(80, 80)).toEqual(at(680, 80));
    expect(at(680, 80)).toEqual([255, 0, 0]);
  });
  it('rejects missing samples, invalid dimensions, and unsafe colors', async () => {
    await expect(
      compose(template({ layers: [newLayer('photo')] }), async () => Buffer.alloc(0)),
    ).rejects.toThrow('Assign a sample');
    expect(() => templateSchema.parse(template({ width: -1 }))).toThrow();
    expect(() => templateSchema.parse(template({ background: 'url(file:///secret)' }))).toThrow();
  });
});
