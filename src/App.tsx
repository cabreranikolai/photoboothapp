import { TemplateCard } from './components/TemplateCard';
import { CaptureWorkspace } from './components/CaptureWorkspace';
import { Toolkit, type UploadKind } from './components/Toolkit';
import { useEffect, useRef, useState } from 'react';
import {
  Aperture,
  LayoutDashboard,
  Camera,
  ScanLine,
  Images,
  SlidersHorizontal,
  History,
  Printer,
  CalendarDays,
  Settings,
  Eye,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Maximize,
  Grid3X3,
  Magnet,
  Download,
  Save,
  ArrowLeft,
  Check,
  Copy,
  FolderOpen,
  X,
  CircleHelp,
} from 'lucide-react';
import { useStudio } from './store';
import { newLayer, type Template, type Layer, type Asset } from '../shared/model';
import { sampleTemplate } from '../shared/samples';
import { EditorCanvas } from './components/EditorCanvas';
import { Properties } from './components/Properties';
import { Button } from './components/ui/button';
const nav = [
  ['Dashboard', LayoutDashboard],
  ['Start Photobooth', Camera],
  ['Frame Designer', ScanLine],
  ['Frame Library', Images],
  ['Camera Settings', SlidersHorizontal],
  ['Photo Sessions', History],
  ['Print Manager', Printer],
  ['Event Settings', CalendarDays],
  ['Application Settings', Settings],
] as const;
export default function App() {
  const [captureActive, setCaptureActive] = useState(false);
  const s = useStudio(),
    [page, setPage] = useState('Frame Designer'),
    [templates, setTemplates] = useState<Template[]>([]);
  const [zoom, setZoom] = useState(1),
    [grid, setGrid] = useState(false),
    [snap, setSnap] = useState(true),
    [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    [error, setError] = useState(false),
    [help, setHelp] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null),
    uploadKind = useRef<UploadKind>('overlay'),
    clipboard = useRef<Layer[]>([]);
  const notify = (message: string, failed = false) => {
    setNotice(message);
    setError(failed);
  };
  const run = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await work();
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), true);
    } finally {
      setBusy(false);
    }
  };
  const api = () => {
    if (!window.studio)
      throw new Error(
        'Open the Electron desktop app with npm run dev to use local files and exports.',
      );
    return window.studio;
  };
  const refresh = async () => setTemplates(await api().listTemplates());
  useEffect(() => {
    if (window.studio) void refresh().catch((e) => notify(String(e), true));
  }, []);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (useStudio.getState().dirty || captureActive) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [captureActive]);
  useEffect(() => {
    const ids = [
      ...new Set(s.template.layers.map((l) => l.assetId).filter((id): id is string => !!id)),
    ];
    for (const id of ids)
      if (!s.assets[id] && window.studio)
        void window.studio
          .getAsset(id)
          .then(s.cache)
          .catch((e) => notify(String(e), true));
  }, [s.template.id, s.template.layers]);
  const save = (asCopy = false) =>
    run(async () => {
      const template = asCopy
        ? {
            ...s.template,
            id: crypto.randomUUID(),
            name: `${s.template.name} copy`,
            createdAt: new Date().toISOString(),
          }
        : s.template;
      await api().saveTemplate(template);
      if (asCopy) s.setTemplate(template);
      else s.saved();
      await refresh();
      notify('Template saved locally. Every layer remains editable.');
    });
  const load = (template: Template) => {
    if (s.dirty && !confirm('Discard unsaved changes and open this template?')) return;
    s.setTemplate(template);
    setPage('Frame Designer');
    setPreview(false);
  };
  const upload = (kind: UploadKind) => {
    uploadKind.current = kind;
    fileInput.current?.click();
  };
  const importFiles = (files: File[]) =>
    run(async () => {
      if (!files.length) return;
      const kind = uploadKind.current,
        imported: Asset[] = [];
      for (const file of files.slice(0, kind === 'samples' ? 20 : 1)) {
        const asset = await api().importAsset(file.name, new Uint8Array(await file.arrayBuffer()));
        s.cache(asset);
        imported.push(asset);
      }
      if (kind === 'samples') {
        const captures = [
          ...new Set(s.template.layers.filter((l) => l.type === 'photo').map((l) => l.capture)),
        ].sort((a, b) => a - b);
        s.change((t) => ({
          ...t,
          layers: t.layers.map((l) =>
            l.type === 'photo' && imported[captures.indexOf(l.capture)]
              ? { ...l, assetId: imported[captures.indexOf(l.capture)].id }
              : l,
          ),
        }));
        notify(
          `${Math.min(imported.length, captures.length)} sample photos assigned in capture order.`,
        );
      } else if (kind === 'replace') {
        const selected = s.template.layers.find((l) => l.id === s.selected[0]);
        if (!selected || selected.type === 'text')
          throw new Error('Select a photo or image layer to replace.');
        s.update(selected.id, { assetId: imported[0].id });
        notify('Image replaced. Position and dimensions preserved.');
      } else {
        const a = imported[0],
          scale = Math.min(s.template.width / a.width, s.template.height / a.height);
        const layer = newLayer('image', {
          name: kind === 'background' ? 'Background image' : a.name,
          assetId: a.id,
          x: Math.round((s.template.width - a.width * scale) / 2),
          y: Math.round((s.template.height - a.height * scale) / 2),
          width: Math.round(a.width * scale),
          height: Math.round(a.height * scale),
          fit: 'fit',
          aspectLocked: true,
        });
        s.change((t) => ({
          ...t,
          layers: kind === 'background' ? [layer, ...t.layers] : [...t.layers, layer],
        }));
        s.select([layer.id]);
        notify('Frame imported. Add and position photo slots manually.');
      }
    });
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable]')) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && ['s', 'z', 'y', 'd', 'c', 'v'].includes(e.key.toLowerCase())) {
        e.preventDefault();
        if (e.key === 's') void save();
        if (e.key === 'z') e.shiftKey ? s.redo() : s.undo();
        if (e.key === 'y') s.redo();
        if (e.key === 'd') s.duplicate();
        if (e.key === 'c')
          clipboard.current = s.template.layers.filter((l) => s.selected.includes(l.id));
        if (e.key === 'v' && clipboard.current.length) {
          const copies = clipboard.current.map((l) => ({
            ...l,
            id: crypto.randomUUID(),
            x: l.x + 30,
            y: l.y + 30,
            locked: false,
          }));
          s.change((t) => ({ ...t, layers: [...t.layers, ...copies] }));
          s.select(copies.map((l) => l.id));
        }
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        s.remove();
      }
      if (e.key === 'Escape') s.select([]);
      if (e.key.startsWith('Arrow') && s.selected.length) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        s.change((t) => ({
          ...t,
          layers: t.layers.map((l) =>
            s.selected.includes(l.id) && !l.locked
              ? {
                  ...l,
                  x: l.x + (e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0),
                  y: l.y + (e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0),
                }
              : l,
          ),
        }));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [s, busy]);
  const reorder = (id: string, delta: number) =>
    s.change((t) => {
      const index = t.layers.findIndex((l) => l.id === id),
        next = index + delta;
      if (next < 0 || next >= t.layers.length) return t;
      [t.layers[index], t.layers[next]] = [t.layers[next], t.layers[index]];
      return t;
    });
  const addPhoto = () => {
    const capture = Math.min(
      20,
      Math.max(0, ...s.template.layers.filter((l) => l.type === 'photo').map((l) => l.capture)) + 1,
    );
    const l = newLayer('photo', { capture, name: `Photo ${capture}` });
    const overlayIndex = s.template.layers.findIndex(
      (l) => l.type === 'image' && l.name !== 'Background image',
    );
    s.change((t) => {
      t.layers.splice(overlayIndex < 0 ? t.layers.length : overlayIndex, 0, l);
      return t;
    });
    s.select([l.id]);
  };
  return (
    <div className="app-shell">
      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg"
        multiple
        hidden
        onChange={(e) => {
          void importFiles(Array.from(e.target.files ?? []));
          e.target.value = '';
        }}
      />
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Aperture size={27} />
          </div>
          <div>
            luma<span>PHOTOBOOTH STUDIO</span>
          </div>
        </div>
        <div className="workspace-label">WORKSPACE</div>
        <nav>
          {nav.map(([name, Icon], i) => (
            <button
              key={name}
              className={`nav-item ${page === name ? 'active' : ''} ${i === 5 ? 'nav-divider' : ''}`}
              disabled={captureActive}
              onClick={() => setPage(name)}
            >
              <Icon size={18} />
              <span>{name}</span>
              {name === 'Frame Designer' && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="offline">
            <span /> Offline workspace
          </div>
          <p>Your memories stay on this device.</p>
          <div className="profile">
            <div className="avatar">LS</div>
            <div>
              Local studio<span>Administrator · v0.1</span>
            </div>
            <Settings size={16} />
          </div>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span> <strong>{page}</strong>
          </div>
          <div className="topbar-right">
            <span className="milestone">
              <span /> Designer milestone
            </span>
            <button className="icon" title="Keyboard shortcuts" onClick={() => setHelp(true)}>
              <CircleHelp size={19} />
            </button>
          </div>
        </header>
        <div className="page-heading">
          <div>
            <div className="eyebrow">YOUR MOMENTS, BEAUTIFULLY FRAMED</div>
            <h1>{page}</h1>
            <p>
              {page === 'Frame Designer'
                ? 'A little creativity. A frame they’ll keep forever.'
                : page === 'Frame Library'
                  ? 'Your layouts, ready for the next celebration.'
                  : 'Your offline photobooth workspace.'}
            </p>
          </div>
          {page === 'Frame Designer' && (
            <div className="row">
              <Button variant="secondary" disabled={busy} onClick={() => setPreview(!preview)}>
                <Eye size={16} />
                {preview ? 'Back to editing' : 'Preview'}
              </Button>
              <Button disabled={busy} onClick={() => void save()}>
                <Save size={16} />
                {busy ? 'Working…' : 'Save template'}
              </Button>
            </div>
          )}
        </div>
        {!window.studio && (
          <div className="web-warning">
            Browser preview · Open with <code>npm run dev</code> for SQLite storage, managed assets,
            and print-resolution export.
          </div>
        )}
        {page === 'Frame Designer' ? (
          <>
            <div className="document-bar">
              <div className="row">
                <span className="document-icon">
                  <ScanLine size={17} />
                </span>
                <input
                  aria-label="Template name"
                  className="document-name"
                  value={s.template.name}
                  maxLength={120}
                  onChange={(e) => s.change((t) => ({ ...t, name: e.target.value }))}
                />
                <span className="unsaved">{s.dirty ? 'Unsaved changes' : 'Editable template'}</span>
              </div>
              <div className="row">
                <span className="pill">
                  {s.template.width / s.template.dpi} × {s.template.height / s.template.dpi} IN
                </span>
                <span className="pill">{s.template.dpi} DPI</span>
                <button className="icon" title="Save as copy" onClick={() => void save(true)}>
                  <Copy size={16} />
                </button>
              </div>
            </div>
            <div className="editor-layout" aria-busy={busy}>
              <Toolkit
                busy={busy}
                upload={upload}
                onDrop={(files) => {
                  uploadKind.current = 'overlay';
                  void importFiles(files);
                }}
                addPhoto={addPhoto}
                reorder={reorder}
              />
              <div className="canvas-panel">
                <div className="canvas-toolbar">
                  <div className="row">
                    <button
                      className="icon"
                      title="Undo (Ctrl+Z)"
                      disabled={!s.past.length}
                      onClick={s.undo}
                    >
                      <Undo2 size={17} />
                    </button>
                    <button
                      className="icon"
                      title="Redo (Ctrl+Y)"
                      disabled={!s.future.length}
                      onClick={s.redo}
                    >
                      <Redo2 size={17} />
                    </button>
                    <span className="separator" />
                    <button
                      className={`icon ${grid ? 'enabled' : ''}`}
                      title="Toggle grid"
                      onClick={() => setGrid(!grid)}
                    >
                      <Grid3X3 size={17} />
                    </button>
                    <button
                      className={`icon ${snap ? 'enabled' : ''}`}
                      title="Toggle snapping"
                      onClick={() => setSnap(!snap)}
                    >
                      <Magnet size={17} />
                    </button>
                  </div>
                  <span className="canvas-mode">
                    {preview ? 'COMPOSITION PREVIEW' : 'LAYOUT EDITOR'}
                  </span>
                  <button className="icon" title="Fit and center canvas" onClick={() => setZoom(1)}>
                    <Maximize size={16} />
                  </button>
                </div>
                <EditorCanvas zoom={zoom} grid={grid} snap={snap} preview={preview} />
                <div className="canvas-bottom">
                  <span>
                    {s.template.width} × {s.template.height} px{' '}
                    <span className="subtle">
                      · {s.template.layers.filter((l) => l.type === 'photo').length} photo slots
                    </span>
                  </span>
                  <div className="zoom-controls">
                    <button
                      className="icon"
                      title="Zoom out"
                      onClick={() => setZoom(Math.max(0.3, zoom - 0.1))}
                    >
                      <ZoomOut size={15} />
                    </button>
                    <span>{Math.round(zoom * 100)}%</span>
                    <button
                      className="icon"
                      title="Zoom in"
                      onClick={() => setZoom(Math.min(3, zoom + 0.1))}
                    >
                      <ZoomIn size={15} />
                    </button>
                  </div>
                </div>
              </div>
              <Properties />
            </div>
            <footer className="editor-footer">
              <span>
                <span className="status-dot" />{' '}
                {busy ? 'Working with local files…' : 'All dimensions use print pixels'}{' '}
                <span className="footer-divider">|</span> Shift + click to select multiple
              </span>
              <div className="row">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      if (await api().exportTemplate(s.template))
                        notify('Editable template package exported with all images.');
                    })
                  }
                >
                  <Download size={14} /> Export template
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const path = await api().exportImage(s.template);
                      if (path) notify(`Print-ready composition saved: ${path}`);
                    })
                  }
                >
                  <Download size={15} /> Export print PNG
                </Button>
              </div>
            </footer>
          </>
        ) : ['Start Photobooth', 'Camera Settings', 'Photo Sessions', 'Print Manager'].includes(
            page,
          ) ? (
          <CaptureWorkspace
            page={page}
            templates={templates}
            currentTemplate={s.template}
            onActiveChange={setCaptureActive}
          />
        ) : page === 'Frame Library' ? (
          <div className="library-content">
            <div className="section-heading">
              Saved on this device{' '}
              <Button
                variant="secondary"
                onClick={() =>
                  void run(async () => {
                    if (s.dirty && !confirm('Discard unsaved changes and import a template?'))
                      return;
                    const t = await api().importTemplate();
                    if (t) {
                      s.setTemplate(t);
                      setPage('Frame Designer');
                      setPreview(false);
                      await refresh();
                    }
                  })
                }
              >
                <FolderOpen size={16} /> Import template
              </Button>
            </div>
            <div className="template-grid">
              {templates.length ? (
                templates.map((t) => (
                  <TemplateCard
                    key={t.id}
                    template={t}
                    open={() => load(t)}
                    remove={() =>
                      void run(async () => {
                        if (confirm(`Delete “${t.name}” from the library?`)) {
                          await api().deleteTemplate(t.id);
                          await refresh();
                        }
                      })
                    }
                  />
                ))
              ) : (
                <div className="empty-state">
                  <FolderOpen size={32} />
                  <h3>Your collection starts here</h3>
                  <p>Save a template from the designer to keep it in your local library.</p>
                </div>
              )}
            </div>
            <div className="section-heading">
              A starting point for every occasion{' '}
              <span className="subtle">EDITABLE SAMPLE LAYOUTS</span>
            </div>
            <div className="template-grid">
              {(['classic', 'strip', 'landscape'] as const).map((kind) => {
                const t = sampleTemplate(kind);
                return <TemplateCard key={kind} template={t} open={() => load(t)} />;
              })}
            </div>
          </div>
        ) : page === 'Dashboard' ? (
          <div className="dashboard-content">
            <div className="welcome-card">
              <span className="eyebrow">MADE FOR THE MOMENTS IN BETWEEN</span>
              <h2>
                Make it a<br />
                memory worth keeping.
              </h2>
              <p>Bring your own frame. Make every photo feel like your event.</p>
              <Button onClick={() => setPage('Frame Designer')}>
                <ScanLine size={16} /> Open frame designer
              </Button>
            </div>
            <div className="stats-grid">
              <div>
                <span>Saved templates</span>
                <strong>{templates.length}</strong>
              </div>
              <div>
                <span>Output resolution</span>
                <strong>
                  300 <small>DPI default</small>
                </strong>
              </div>
              <div>
                <span>Camera integration</span>
                <strong className="smaller">Not configured</strong>
              </div>
            </div>
            <div className="milestone-card">
              <Check size={20} />
              <div>
                <h3>First milestone · Your custom frame workflow</h3>
                <p>
                  Upload a frame → position photo slots → load sample photos → save → export a
                  full-resolution PNG.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="phase-page">
            <div className="phase-icon">
              {page === 'Camera Settings' || page === 'Start Photobooth' ? (
                <Camera size={36} />
              ) : page === 'Print Manager' ? (
                <Printer size={36} />
              ) : (
                <Settings size={36} />
              )}
            </div>
            <span className="badge">PLANNED MILESTONE</span>
            <h2>
              {page === 'Camera Settings'
                ? 'A real camera connection comes next.'
                : page === 'Start Photobooth'
                  ? 'First, make your frame picture-perfect.'
                  : `${page} is part of the next phase.`}
            </h2>
            <p>
              {page === 'Camera Settings'
                ? 'The camera adapter contract is prepared. No DSLR SDK is connected, and no simulated camera is presented as hardware. Windows SDK integration and hardware testing follow the frame designer milestone.'
                : 'This version focuses on the complete custom frame workflow. Capture sessions, event profiles, kiosk mode, and native printing are not implemented yet.'}
            </p>
            <Button onClick={() => setPage('Frame Designer')}>
              <ArrowLeft size={16} /> Back to frame designer
            </Button>
          </div>
        )}
      </main>
      {notice && (
        <div role={error ? 'alert' : 'status'} className={`toast ${error ? 'error' : ''}`}>
          <span>
            {error ? 'Unable to complete action' : 'All set'}
            <p>{notice}</p>
          </span>
          <button className="icon" aria-label="Dismiss notification" onClick={() => setNotice('')}>
            <X size={16} />
          </button>
        </div>
      )}
      {help && (
        <div className="modal-backdrop" onClick={() => setHelp(false)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Keyboard shortcuts"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="section-heading">
              A few handy shortcuts
              <button className="icon" aria-label="Close shortcuts" onClick={() => setHelp(false)}>
                <X size={18} />
              </button>
            </div>
            {[
              ['Save template', 'Ctrl S'],
              ['Undo / redo', 'Ctrl Z / Ctrl Y'],
              ['Duplicate', 'Ctrl D'],
              ['Copy / paste', 'Ctrl C / Ctrl V'],
              ['Move 1 / 10 pixels', 'Arrow / Shift Arrow'],
              ['Multi-select', 'Shift click'],
              ['Delete unlocked selection', 'Delete'],
              ['Deselect', 'Escape'],
            ].map(([label, key]) => (
              <div className="shortcut" key={key}>
                <span>{label}</span>
                <kbd>{key}</kbd>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
