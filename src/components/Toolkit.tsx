import {
  Sparkles,
  Upload,
  ImagePlus,
  Type,
  Plus,
  Images,
  Layers,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { Button } from './ui/button';
import { useStudio } from '../store';
import { newLayer } from '../../shared/model';
export type UploadKind = 'overlay' | 'background' | 'samples' | 'replace';
interface Props {
  busy: boolean;
  upload(kind: UploadKind): void;
  onDrop(files: File[]): void;
  addPhoto(): void;
  reorder(id: string, delta: number): void;
}
export function Toolkit({ busy, upload, onDrop, addPhoto, reorder }: Props) {
  const s = useStudio();
  return (
    <aside className="assets-panel panel">
      <div className="panel-heading">
        Design toolkit <Sparkles size={15} />
      </div>
      <section>
        <div className="section-heading">Frame assets</div>
        <button
          className="upload-zone"
          disabled={busy}
          onClick={() => upload('overlay')}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();

            onDrop(Array.from(e.dataTransfer.files));
          }}
        >
          <div>
            <Upload size={21} />
          </div>
          <strong>Upload your frame</strong>
          <span>Drop a PNG or JPG here</span>
          <small>Transparency stays intact</small>
        </button>
        <div className="two-buttons">
          <Button variant="secondary" size="sm" onClick={() => upload('background')}>
            Background
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={
              !s.selected.length ||
              s.template.layers.find((l) => l.id === s.selected[0])?.type === 'text'
            }
            onClick={() => upload('replace')}
          >
            Replace image
          </Button>
        </div>
      </section>
      <section>
        <div className="section-heading">Add to your canvas</div>
        <button className="tool-row" onClick={addPhoto}>
          <div className="tool-symbol">
            <ImagePlus size={18} />
          </div>
          <div>
            Photo placeholder<span>Assign a captured photo</span>
          </div>
          <Plus size={15} />
        </button>
        <button className="tool-row" onClick={() => s.add(newLayer('text'))}>
          <div className="tool-symbol">
            <Type size={18} />
          </div>
          <div>
            Text element<span>Add a personal touch</span>
          </div>
          <Plus size={15} />
        </button>
        <Button
          className="full-width"
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={() => upload('samples')}
        >
          <Images size={15} /> Load sample photos
        </Button>
      </section>
      <section className="layers-section">
        <div className="section-heading">
          <span className="row">
            <Layers size={14} /> Layers
          </span>
          <span className="count">{s.template.layers.length}</span>
        </div>
        <p className="hint">Topmost layer appears in front.</p>
        <div className="layer-list">
          {[...s.template.layers].reverse().map((l) => (
            <div key={l.id} className={`layer-row ${s.selected.includes(l.id) ? 'selected' : ''}`}>
              <button
                className="layer-label"
                onClick={(e) => s.select(e.shiftKey ? [...new Set([...s.selected, l.id])] : [l.id])}
              >
                <span className={`layer-thumbnail ${l.type}`}>
                  {l.type === 'photo' ? (
                    l.capture
                  ) : l.type === 'text' ? (
                    <Type size={14} />
                  ) : (
                    <Images size={14} />
                  )}
                </span>
                <span>{l.name}</span>
              </button>
              <button
                className="icon tiny"
                title={l.visible ? 'Hide layer' : 'Show layer'}
                onClick={() => s.update(l.id, { visible: !l.visible })}
              >
                {l.visible ? <Eye size={12} /> : <EyeOff size={12} />}
              </button>
              <button
                className="icon tiny"
                title={l.locked ? 'Unlock layer' : 'Lock layer'}
                onClick={() => s.update(l.id, { locked: !l.locked })}
              >
                {l.locked ? <Lock size={12} /> : <Unlock size={12} />}
              </button>
            </div>
          ))}
        </div>
        <div className="layer-actions">
          <Button
            variant="ghost"
            size="sm"
            disabled={s.selected.length !== 1}
            onClick={() => reorder(s.selected[0], 1)}
          >
            <ChevronUp size={14} /> Raise
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={s.selected.length !== 1}
            onClick={() => reorder(s.selected[0], -1)}
          >
            <ChevronDown size={14} /> Lower
          </Button>
        </div>
      </section>
      <div className="tip">
        <span>DESIGN NOTE</span>Place your PNG overlay above photo slots. Transparent areas reveal
        the photos underneath.
      </div>
    </aside>
  );
}
