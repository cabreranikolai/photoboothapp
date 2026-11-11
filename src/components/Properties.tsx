import { Lock, Unlock, Copy, Trash2 } from 'lucide-react';
import { useStudio } from '../store';
import { Button } from './ui/button';
import type { Layer } from '../../shared/model';
function NumberField({
  label,
  value,
  onChange,
  min = -12000,
  max = 12000,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const n = e.target.valueAsNumber;
          if (Number.isFinite(n) && n >= min && n <= max) onChange(n);
        }}
      />
    </label>
  );
}
export function Properties() {
  const s = useStudio(),
    t = s.template,
    l = t.layers.find((l) => l.id === s.selected[0]);
  const update = (patch: Partial<Layer>) => {
    if (l) s.update(l.id, patch);
  };
  const dim = (key: 'width' | 'height', value: number) => {
    if (!l) return;
    update({
      [key]: value,
      ...(l.aspectLocked
        ? {
            [key === 'width' ? 'height' : 'width']: Math.max(
              1,
              Math.round((value * l[key === 'width' ? 'height' : 'width']) / l[key]),
            ),
          }
        : {}),
    });
  };
  return (
    <aside className="properties panel">
      <div className="panel-heading">
        Properties <span className="subtle">{l ? l.type.toUpperCase() : 'CANVAS'}</span>
      </div>
      {l ? (
        <>
          <section>
            <div className="section-heading">
              {s.selected.length > 1
                ? `${s.selected.length} selected · first object`
                : 'Selected element'}
              <button
                className="icon"
                title={l.locked ? 'Unlock element' : 'Lock element'}
                onClick={() => update({ locked: !l.locked })}
              >
                {l.locked ? <Lock size={14} /> : <Unlock size={14} />}
              </button>
            </div>
            <input
              aria-label="Element name"
              value={l.name}
              onChange={(e) => update({ name: e.target.value })}
            />
            <p className="hint">
              Coordinates in print pixels. Rotation is around the top-left corner.
            </p>
          </section>
          <fieldset disabled={l.locked}>
            <section>
              <div className="section-heading">
                Position & size <span className="subtle">PX</span>
              </div>
              <div className="field-grid">
                <NumberField label="X position" value={l.x} onChange={(x) => update({ x })} />
                <NumberField label="Y position" value={l.y} onChange={(y) => update({ y })} />
                <NumberField
                  label="Width"
                  value={l.width}
                  min={1}
                  onChange={(n) => dim('width', n)}
                />
                <NumberField
                  label="Height"
                  value={l.height}
                  min={1}
                  onChange={(n) => dim('height', n)}
                />
                <NumberField
                  label="Rotation °"
                  value={l.rotation}
                  min={-360}
                  max={360}
                  onChange={(rotation) => update({ rotation })}
                />
                <NumberField
                  label="Corner radius"
                  value={l.radius}
                  min={0}
                  max={6000}
                  onChange={(radius) => update({ radius })}
                />
              </div>
              <label className="check">
                <input
                  type="checkbox"
                  checked={l.aspectLocked}
                  onChange={(e) => update({ aspectLocked: e.target.checked })}
                />{' '}
                Lock aspect ratio <span>{(l.width / l.height).toFixed(2)}:1</span>
              </label>
              <div className="align-buttons">
                <Button variant="secondary" size="sm" onClick={() => update({ x: 0 })}>
                  Left
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => update({ x: Math.round((t.width - l.width) / 2) })}
                >
                  Center
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => update({ x: t.width - l.width })}
                >
                  Right
                </Button>
              </div>
            </section>
            {l.type !== 'text' ? (
              <section>
                <div className="section-heading">Photo & crop</div>
                {l.type === 'photo' && (
                  <NumberField
                    label="Assigned capture"
                    value={l.capture}
                    min={1}
                    max={20}
                    onChange={(capture) => update({ capture })}
                  />
                )}
                <label className="field">
                  <span>Image scaling</span>
                  <select
                    value={l.fit}
                    onChange={(e) => update({ fit: e.target.value as 'fill' | 'fit' })}
                  >
                    <option value="fill">Fill · crop to edges</option>
                    <option value="fit">Fit · preserve entire image</option>
                  </select>
                </label>
                <div className="field-grid">
                  <NumberField
                    label="Crop X (0–1)"
                    value={l.cropX}
                    min={0}
                    max={1}
                    step={0.05}
                    onChange={(cropX) => update({ cropX })}
                  />
                  <NumberField
                    label="Crop Y (0–1)"
                    value={l.cropY}
                    min={0}
                    max={1}
                    step={0.05}
                    onChange={(cropY) => update({ cropY })}
                  />
                </div>
              </section>
            ) : (
              <section>
                <label className="field">
                  <span>Text</span>
                  <input value={l.text} onChange={(e) => update({ text: e.target.value })} />
                </label>
                <NumberField
                  label="Font size"
                  value={l.fontSize}
                  min={8}
                  max={1000}
                  onChange={(fontSize) => update({ fontSize })}
                />
              </section>
            )}
            <section>
              <div className="section-heading">Appearance</div>
              <div className="field-grid">
                <NumberField
                  label="Border width"
                  value={l.border}
                  min={0}
                  max={100}
                  onChange={(border) => update({ border })}
                />
                <label className="field">
                  <span>{l.type === 'text' ? 'Text / border' : 'Border color'}</span>
                  <input
                    type="color"
                    value={l.color}
                    onChange={(e) => update({ color: e.target.value })}
                  />
                </label>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  update({ rotation: 0, cropX: 0.5, cropY: 0.5, radius: 0, border: 0 })
                }
              >
                Reset rotation & appearance
              </Button>
            </section>
          </fieldset>
          <section className="row">
            <Button variant="secondary" size="sm" onClick={s.duplicate}>
              <Copy size={14} /> Duplicate
            </Button>
            <Button variant="ghost" size="sm" disabled={l.locked} onClick={s.remove}>
              <Trash2 size={14} /> Delete
            </Button>
          </section>
        </>
      ) : (
        <section>
          <div className="empty-properties">
            Select an element on the canvas to fine-tune its position, size, and appearance.
          </div>
        </section>
      )}
      <section>
        <div className="section-heading">
          Paper & output <span className="badge">{t.dpi} DPI</span>
        </div>
        <label className="field">
          <span>Paper preset</span>
          <select
            value={`${t.width / t.dpi}x${t.height / t.dpi}`}
            onChange={(e) => {
              if (e.target.value === 'custom') return;
              const [w, h] = e.target.value.split('x').map(Number);
              s.change((t) => ({
                ...t,
                width: w * t.dpi,
                height: h * t.dpi,
                duplicateStrip: false,
              }));
            }}
          >
            <option value="4x6">4 × 6 in · portrait</option>
            <option value="6x4">4 × 6 in · landscape</option>
            <option value="2x6">2 × 6 in · photo strip</option>
            <option value="custom">Custom dimensions</option>
          </select>
        </label>
        <div className="field-grid">
          <NumberField
            label="Width px"
            value={t.width}
            min={100}
            max={6000}
            onChange={(width) => s.change((t) => ({ ...t, width, duplicateStrip: false }))}
          />
          <NumberField
            label="Height px"
            value={t.height}
            min={100}
            max={6000}
            onChange={(height) => s.change((t) => ({ ...t, height, duplicateStrip: false }))}
          />
          <NumberField
            label="DPI"
            value={t.dpi}
            min={72}
            max={600}
            onChange={(dpi) => s.change((t) => ({ ...t, dpi, duplicateStrip: false }))}
          />
          <label className="field">
            <span>Background</span>
            <input
              type="color"
              value={t.background}
              onChange={(e) => s.change((t) => ({ ...t, background: e.target.value }))}
            />
          </label>
        </div>
        <label className="check">
          <input
            type="checkbox"
            disabled={t.width !== t.dpi * 2 || t.height !== t.dpi * 6}
            checked={t.duplicateStrip}
            onChange={(e) => s.change((t) => ({ ...t, duplicateStrip: e.target.checked }))}
          />{' '}
          Duplicate strips on 4 × 6
        </label>
        <p className="hint">
          Changing paper size preserves object coordinates. Reposition elements to fit the new
          canvas.
        </p>
      </section>
    </aside>
  );
}
