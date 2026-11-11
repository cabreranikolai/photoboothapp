import sharp from 'sharp';
import { templateSchema, type Template } from '../shared/model';
import { imagePlacement } from '../shared/geometry';
export type AssetResolver = (id: string) => Promise<Buffer>;
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!,
  );
/** Render from original managed assets, never from the editor screenshot. */
export async function compose(input: Template, resolve: AssetResolver): Promise<Buffer> {
  const t = templateSchema.parse(input);
  const parts: string[] = [];
  for (const l of t.layers.filter((l) => l.visible)) {
    let content = '';
    if (l.type === 'text') {
      content = `<text x="0" y="${l.fontSize * 0.9}" font-family="Arial" font-size="${l.fontSize}" fill="${l.color}">${escape(l.text)}</text>`;
    } else if (l.assetId) {
      const bytes = await resolve(l.assetId);
      const meta = await sharp(bytes).metadata();
      const p = imagePlacement(meta.width!, meta.height!, l);
      content = `<image x="${p.x}" y="${p.y}" width="${p.width}" height="${p.height}" preserveAspectRatio="none" href="data:image/png;base64,${bytes.toString('base64')}"/>`;
    } else if (l.type === 'photo') {
      throw new Error(
        `Assign a sample photo to ${l.name} (capture ${l.capture}) before exporting.`,
      );
    }
    const radius = Math.min(l.radius, l.width / 2, l.height / 2);
    parts.push(
      `<g transform="translate(${l.x} ${l.y}) rotate(${l.rotation})"><defs><clipPath id="c${l.id}"><rect width="${l.width}" height="${l.height}" rx="${radius}"/></clipPath></defs><g clip-path="url(#c${l.id})">${content}</g>${l.border ? `<rect x="${l.border / 2}" y="${l.border / 2}" width="${Math.max(0, l.width - l.border)}" height="${Math.max(0, l.height - l.border)}" rx="${radius}" fill="none" stroke="${l.color}" stroke-width="${l.border}"/>` : ''}</g>`,
    );
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${t.width}" height="${t.height}"><rect width="100%" height="100%" fill="${t.background}"/>${parts.join('')}</svg>`;
  let result = await sharp(Buffer.from(svg)).png().toBuffer();
  if (t.duplicateStrip) {
    if (t.width !== t.dpi * 2 || t.height !== t.dpi * 6)
      throw new Error('Duplicate strips require a 2 × 6 inch portrait canvas.');
    result = await sharp({
      create: { width: t.width * 2, height: t.height, channels: 4, background: t.background },
    })
      .composite([
        { input: result, left: 0, top: 0 },
        { input: result, left: t.width, top: 0 },
      ])
      .png()
      .toBuffer();
  }
  return sharp(result).withMetadata({ density: t.dpi }).png().toBuffer();
}
