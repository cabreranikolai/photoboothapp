import type { Layer } from './model';
/** All dimensions are output pixels; crop is shared by Konva and Sharp. */
export function imagePlacement(
  iw: number,
  ih: number,
  l: Pick<Layer, 'width' | 'height' | 'fit' | 'cropX' | 'cropY'>,
) {
  const scale =
    l.fit === 'fill'
      ? Math.max(l.width / iw, l.height / ih)
      : Math.min(l.width / iw, l.height / ih);
  const width = iw * scale,
    height = ih * scale;
  return { x: (l.width - width) * l.cropX, y: (l.height - height) * l.cropY, width, height };
}
