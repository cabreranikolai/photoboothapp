import { Plus, X } from 'lucide-react';
import type { Template } from '../../shared/model';
export function TemplateCard({
  template: t,
  open,
  remove,
}: {
  template: Template;
  open: () => void;
  remove?: () => void;
}) {
  return (
    <article className="template-card">
      <button className="template-cover" onClick={open}>
        <div
          className="mini-paper"
          style={{ background: t.background, aspectRatio: `${t.width}/${t.height}` }}
        >
          {t.layers
            .filter((l) => l.visible)
            .map((l) => (
              <div
                key={l.id}
                style={{
                  position: 'absolute',
                  left: `${(l.x / t.width) * 100}%`,
                  top: `${(l.y / t.height) * 100}%`,
                  width: `${(l.width / t.width) * 100}%`,
                  height: `${(l.height / t.height) * 100}%`,
                  background: l.type === 'photo' ? '#bdccbf' : 'transparent',
                  transformOrigin: 'top left',
                  transform: `rotate(${l.rotation}deg)`,
                  fontSize: 7,
                  overflow: 'hidden',
                  color: l.color,
                }}
              >
                {l.type === 'text' ? l.text : l.type === 'photo' ? l.capture : ''}
              </div>
            ))}
        </div>
      </button>
      <div className="template-info">
        <div>
          <h3>{t.name}</h3>
          <p>
            {t.width / t.dpi} × {t.height / t.dpi} in ·{' '}
            {t.layers.filter((l) => l.type === 'photo').length} photos · {t.dpi} DPI
          </p>
        </div>
        <button
          className="icon"
          title={remove ? 'Delete saved template' : 'Open sample template'}
          onClick={remove ?? open}
        >
          {remove ? <X size={16} /> : <Plus size={18} />}
        </button>
      </div>
    </article>
  );
}
