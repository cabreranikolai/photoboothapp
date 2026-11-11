import { useEffect, useRef, useState } from 'react';
import { Camera, Play, Square, Printer, Download, RefreshCw, CheckCircle2 } from 'lucide-react';
import { Button } from './ui/button';
import type { Template } from '../../shared/model';
import {
  defaultCaptureSettings,
  type CaptureSettings,
  type PhotoSession,
  type LocalPrinter,
  type PrintJob,
} from '../../shared/sessions';
const api = () => {
  if (!window.studio) throw new Error('Open the Electron desktop app to capture or print.');
  return window.studio;
};
function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new Error('Session cancelled.'));
    const abort = () => {
      clearTimeout(timer);
      reject(new Error('Session cancelled.'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}
export function CaptureWorkspace({
  page,
  templates,
  currentTemplate,
  onActiveChange,
}: {
  page: string;
  templates: Template[];
  currentTemplate: Template;
  onActiveChange(active: boolean): void;
}) {
  const [settings, setSettings] = useState<CaptureSettings>(defaultCaptureSettings),
    [templateId, setTemplateId] = useState(currentTemplate.id);
  const [sessions, setSessions] = useState<PhotoSession[]>([]),
    [jobs, setJobs] = useState<PrintJob[]>([]),
    [printers, setPrinters] = useState<LocalPrinter[]>([]);
  const [session, setSession] = useState<PhotoSession>(),
    [selected, setSelected] = useState<PhotoSession>(),
    [image, setImage] = useState(''),
    [photos, setPhotos] = useState<string[]>([]);
  const [stream, setStream] = useState<MediaStream>(),
    [devices, setDevices] = useState<MediaDeviceInfo[]>([]),
    [dslrs, setDslrs] = useState<string[]>([]),
    [connected, setConnected] = useState(false);
  const [live, setLive] = useState(''),
    [liveError, setLiveError] = useState(''),
    [busy, setBusy] = useState(false),
    [active, setActive] = useState(false),
    [countdown, setCountdown] = useState<number | null>(null),
    [progress, setProgress] = useState('Ready for your next moment'),
    [message, setMessage] = useState(''),
    [search, setSearch] = useState('');
  const video = useRef<HTMLVideoElement>(null),
    media = useRef<MediaStream | undefined>(undefined),
    running = useRef(false),
    cancel = useRef<AbortController | undefined>(undefined),
    current = useRef<PhotoSession | undefined>(undefined);
  const allTemplates = [currentTemplate, ...templates.filter((t) => t.id !== currentTemplate.id)],
    template = allTemplates.find((t) => t.id === templateId) ?? currentTemplate;
  const refresh = async () => {
    const [s, j, p] = await Promise.all([
      api().listSessions(),
      api().listPrintJobs(),
      api().listPrinters(),
    ]);
    setSessions(s);
    setJobs(j);
    setPrinters(p);
  };
  const change = (patch: Partial<CaptureSettings>) => setSettings((s) => ({ ...s, ...patch }));
  const work = async (fn: () => Promise<void>) => {
    setMessage('');
    try {
      await fn();
    } catch (e) {
      setMessage(String(e));
    }
  };
  useEffect(() => {
    void work(async () => {
      setSettings(await api().getCaptureSettings());
      await refresh();
    });
    return () => {
      cancel.current?.abort();
      media.current?.getTracks().forEach((t) => t.stop());
      void window.studio?.disconnectDSLR().catch(() => {});
    };
  }, []);
  useEffect(() => {
    onActiveChange(active);
  }, [active, onActiveChange]);
  useEffect(() => {
    if (video.current && stream) {
      video.current.srcObject = stream;
      void video.current.play().catch((e) => setMessage(String(e)));
    }
  }, [stream, page, image]);
  useEffect(() => {
    if (
      !connected ||
      settings.source !== 'digicam' ||
      busy ||
      !['Start Photobooth', 'Camera Settings'].includes(page)
    )
      return;
    let stopped = false,
      timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const frame = await api().dslrPreview();
        if (!stopped) {
          setLive(frame);
          setLiveError('');
        }
      } catch (e) {
        if (!stopped)
          setLiveError(`Live view unavailable: ${String(e)}. Still capture may remain available.`);
      } finally {
        if (!stopped) timer = setTimeout(poll, 500);
      }
    };
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [connected, settings.source, busy, page]);
  useEffect(() => {
    if (page !== 'Print Manager') return;
    const timer = setInterval(() => {
      void work(refresh);
    }, 1500);
    return () => clearInterval(timer);
  }, [page]);
  const connect = async () => {
    setConnected(false);
    setLive('');
    setLiveError('');
    media.current?.getTracks().forEach((t) => t.stop());
    setStream(undefined);
    if (settings.source === 'webcam') {
      const next = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          ...(settings.deviceId ? { deviceId: { exact: settings.deviceId } } : {}),
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });
      media.current = next;
      setStream(next);
      setDevices(
        (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput'),
      );
      next.getVideoTracks()[0].onended = () => {
        setConnected(false);
        setMessage('Camera disconnected. Reconnect before continuing.');
      };
    } else if (settings.source === 'digicam') {
      await api().connectDSLR(settings.deviceId);
    }
    setConnected(true);
    setMessage(
      settings.source === 'demo'
        ? 'Demo Mode connected. Generated images are not camera photographs.'
        : 'Camera connected.',
    );
  };
  const showSession = async (s: PhotoSession) => {
    setSelected(s);
    setImage('');
    setPhotos([]);
    if (s.status === 'complete') setImage(await api().sessionImage(s.id));
    setPhotos(
      await Promise.all(s.shots.map(async (shot) => (await api().getAsset(shot.assetId)).dataUrl)),
    );
  };
  const webcamShot = async () => {
    const v = video.current;
    if (
      !media.current?.getVideoTracks().some((t) => t.readyState === 'live') ||
      !v ||
      !v.videoWidth ||
      v.readyState < 2
    )
      throw new Error('Webcam is not ready. Reconnect and wait for live preview.');
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext('2d')!.drawImage(v, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Could not encode camera image.'))),
        'image/jpeg',
        0.96,
      ),
    );
    return new Uint8Array(await blob.arrayBuffer());
  };
  const start = async (resume = false) => {
    if (running.current) return;
    if (!connected) {
      setMessage('Connect a camera or explicitly choose Demo Mode first.');
      return;
    }
    if (settings.autoPrint && !printers.some((p) => p.name === settings.printer)) {
      setMessage('Select an installed printer or disable automatic printing.');
      return;
    }
    running.current = true;
    setBusy(true);
    setMessage('');
    setImage('');
    setPhotos([]);
    cancel.current = new AbortController();
    const signal = cancel.current.signal;
    try {
      let s =
        resume && current.current ? current.current : await api().beginSession(template, settings);
      current.current = s;
      setSession(s);
      setActive(true);
      const numbers = [
        ...new Set(
          s.template.layers.filter((l) => l.type === 'photo' && l.visible).map((l) => l.capture),
        ),
      ].sort((a, b) => a - b);
      for (const n of numbers) {
        if (s.selected[n]) continue;
        if (signal.aborted) throw new Error('Session cancelled.');
        setProgress(`Photo ${numbers.indexOf(n) + 1} of ${numbers.length} · capture ${n}`);
        for (let seconds = settings.countdown; seconds > 0; seconds--) {
          setCountdown(seconds);
          await delay(1000, signal);
        }
        setCountdown(null);
        setProgress(`Capturing photo ${numbers.indexOf(n) + 1}…`);
        s = await api().captureShot(
          s.id,
          n,
          settings.source === 'webcam' ? await webcamShot() : undefined,
        );
        current.current = s;
        setSession(s);
        const photo = await api().getAsset(s.selected[n]);
        setPhotos((previous) => [...previous, photo.dataUrl]);
        await delay(settings.delay * 1000, signal);
      }
      if (signal.aborted) throw new Error('Session cancelled.');
      setProgress('Rendering your print-ready composition…');
      s = await api().finishSession(s.id);
      current.current = s;
      setSession(s);
      setActive(false);
      await showSession(s);
      setProgress('Your photos are ready');
      await refresh();
      if (settings.autoPrint) {
        await api().printSession(s.id, settings.printer, settings.copies);
        setMessage('Print queued. Check Print Manager for submission status.');
      }
    } catch (e) {
      setMessage(String(e));
      setProgress(
        signal.aborted ? 'Session cancelled' : 'Session paused — your originals are safe',
      );
      if (signal.aborted && current.current && current.current.status !== 'complete') {
        try {
          const stopped = await api().cancelSession(current.current.id);
          current.current = stopped;
          setSession(stopped);
          setActive(false);
          await refresh();
        } catch (error) {
          setMessage(String(error));
        }
      }
    } finally {
      setCountdown(null);
      setBusy(false);
      running.current = false;
    }
  };
  const cancelSession = async () => {
    if (busy) {
      cancel.current?.abort();
      setProgress('Stopping after any active camera download…');
      return;
    }
    if (current.current) {
      await api().cancelSession(current.current.id);
      setActive(false);
      current.current = undefined;
      setSession(undefined);
      setProgress('Ready for your next moment');
      await refresh();
    }
  };
  const print = async (s: PhotoSession) => {
    await api().printSession(s.id, settings.printer, settings.copies);
    setMessage(
      'Print queued. Submitted means Windows accepted the job, not that paper has printed.',
    );
    await refresh();
  };
  const preview = (
    <div className="capture-preview">
      {image && page !== 'Camera Settings' ? (
        <img src={image} alt="Final composition at print resolution" />
      ) : settings.source === 'webcam' ? (
        <video
          ref={video}
          autoPlay
          playsInline
          muted
          style={{ transform: settings.mirror ? 'scaleX(-1)' : undefined }}
        />
      ) : settings.source === 'digicam' && live ? (
        <img
          src={live}
          alt="DSLR live view"
          style={{ transform: settings.mirror ? 'scaleX(-1)' : undefined }}
        />
      ) : (
        <div className="capture-placeholder">
          <Camera size={52} />
          <h2>{settings.source === 'demo' ? 'DEMO MODE' : 'Connect your camera'}</h2>
          <p>
            {settings.source === 'demo'
              ? 'Generated test images · no real camera'
              : 'Your live camera preview appears here'}
          </p>
        </div>
      )}
      {countdown !== null && (
        <div className="countdown" aria-live="assertive">
          {countdown}
        </div>
      )}
      <span className="capture-source">
        {settings.source === 'demo'
          ? 'DEMO MODE · SYNTHETIC IMAGES'
          : settings.source === 'digicam'
            ? 'DSLR · DIGICAMCONTROL'
            : 'WEBCAM'}{' '}
        · {connected ? 'Connected' : 'Not connected'}
      </span>
    </div>
  );
  const printerFields = (
    <>
      <label className="field">
        <span>Installed printer</span>
        <select
          aria-label="Installed printer"
          value={settings.printer}
          onChange={(e) => change({ printer: e.target.value })}
        >
          <option value="">Select printer</option>
          {printers.map((p) => (
            <option value={p.name} key={p.name}>
              {p.displayName || p.name}
              {p.isDefault ? ' (default)' : ''}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Copies</span>
        <input
          type="number"
          min={1}
          max={10}
          value={settings.copies}
          onChange={(e) => change({ copies: Math.max(1, Math.min(10, Number(e.target.value))) })}
        />
      </label>
      <Button variant="secondary" size="sm" onClick={() => void work(refresh)}>
        <RefreshCw size={14} /> Refresh printers
      </Button>
      <p className="hint">
        Paper comes from the template: exact inches at its DPI. Enable duplicate strips in the
        designer for two 2 × 6 strips on a 4 × 6 sheet. Match the printer’s loaded paper and driver
        settings.
      </p>
    </>
  );
  return (
    <div className="capture-workspace">
      {message && (
        <div role="status" className="capture-message">
          {message}
        </div>
      )}
      {['Start Photobooth', 'Camera Settings'].includes(page) ? (
        <div className="capture-grid">
          <div>
            {preview}
            {liveError && <p className="capture-message">{liveError}</p>}
            <div className="capture-actions">
              <div>
                <h3>{progress}</h3>
                <p>
                  {session
                    ? `Session ${session.id.slice(0, 8)} · ${session.shots.length} original photos saved`
                    : `${template.name} · ${new Set(template.layers.filter((l) => l.type === 'photo' && l.visible).map((l) => l.capture)).size} captures`}
                </p>
              </div>
              <div className="row">
                {active ? (
                  <>
                    <Button variant="secondary" onClick={() => void work(cancelSession)}>
                      <Square size={15} />
                      {busy ? 'Cancel after shot' : 'Cancel session'}
                    </Button>
                    {!busy && <Button onClick={() => void start(true)}>Resume session</Button>}
                  </>
                ) : (
                  <Button disabled={busy || !connected} onClick={() => void start()}>
                    <Play size={16} />
                    {session?.status === 'complete' ? 'Start next session' : 'Start session'}
                  </Button>
                )}
              </div>
            </div>
            <div className="shot-strip">
              {photos.map((src, i) => (
                <img src={src} alt={`Saved original ${i + 1}`} key={i} />
              ))}
            </div>
            {session?.status === 'complete' && (
              <div className="row capture-result-actions">
                <Button
                  onClick={() => void work(() => print(session))}
                  disabled={!settings.printer}
                >
                  <Printer size={16} /> Print session
                </Button>
                <Button
                  variant="secondary"
                  onClick={() =>
                    void work(async () => {
                      await api().exportSession(session.id);
                    })
                  }
                >
                  <Download size={15} /> Export PNG
                </Button>
                <Button
                  variant="secondary"
                  onClick={() =>
                    void work(async () => {
                      await api().exportSessionPDF(session.id);
                    })
                  }
                >
                  Save print PDF
                </Button>
                {settings.retakes && (
                  <Button variant="ghost" onClick={() => void start()}>
                    <RefreshCw size={15} /> Retake all photos
                  </Button>
                )}
              </div>
            )}
          </div>
          <aside className="capture-controls panel">
            <fieldset disabled={busy}>
              <section>
                <div className="section-heading">Camera connection</div>
                <label className="field">
                  <span>Capture source</span>
                  <select
                    aria-label="Capture source"
                    disabled={active}
                    value={settings.source}
                    onChange={(e) => {
                      media.current?.getTracks().forEach((t) => t.stop());
                      setStream(undefined);
                      setConnected(false);
                      setImage('');
                      change({ source: e.target.value as CaptureSettings['source'], deviceId: '' });
                      void window.studio?.disconnectDSLR().catch(() => {});
                    }}
                  >
                    <option value="webcam">Webcam / USB video camera</option>
                    <option value="digicam">DSLR via digiCamControl</option>
                    <option value="demo">Demo Mode (generated images)</option>
                  </select>
                </label>
                {settings.source === 'webcam' && (
                  <label className="field">
                    <span>Video device</span>
                    <select
                      aria-label="Video device"
                      disabled={active}
                      value={settings.deviceId}
                      onChange={(e) => {
                        change({ deviceId: e.target.value });
                        setConnected(false);
                      }}
                    >
                      <option value="">System default camera</option>
                      {devices.map((d) => (
                        <option key={d.deviceId} value={d.deviceId}>
                          {d.label || 'Camera'}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {settings.source === 'digicam' && (
                  <>
                    <p className="hint">
                      Run digiCamControl, connect one supported DSLR, enable its webserver on port
                      5513 and “Allow interaction via web server”. Set capture format to JPEG. Do
                      not trigger captures from another app during a session.
                    </p>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        void work(async () => {
                          setDslrs(await api().detectDSLR());
                        })
                      }
                    >
                      Detect DSLRs
                    </Button>
                    <label className="field">
                      <span>DSLR device</span>
                      <select
                        aria-label="DSLR device"
                        disabled={active}
                        value={settings.deviceId}
                        onChange={(e) => {
                          change({ deviceId: e.target.value });
                          setConnected(false);
                        }}
                      >
                        <option value="">Select DSLR</option>
                        {dslrs.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                )}
                <Button
                  className="full-width"
                  variant="secondary"
                  onClick={() => void work(connect)}
                >
                  <Camera size={15} /> {connected ? 'Reconnect camera' : 'Connect camera'}
                </Button>
                <label className="check">
                  <input
                    type="checkbox"
                    role="switch"
                    checked={settings.mirror}
                    disabled={active}
                    onChange={(e) => change({ mirror: e.target.checked })}
                  />
                  Mirror camera
                </label>
                <p className="hint">
                  {settings.mirror ? 'Mirrored' : 'Normal'} preview and captured photos. Prints use
                  the same orientation; frame text stays unchanged. Save settings to remember this
                  choice.
                </p>
              </section>
              <fieldset disabled={active}>
                <section>
                  <div className="section-heading">Session setup</div>
                  <label className="field">
                    <span>Event name</span>
                    <input
                      value={settings.eventName}
                      onChange={(e) => change({ eventName: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span>Frame template</span>
                    <select
                      aria-label="Frame template"
                      value={templateId}
                      onChange={(e) => {
                        setTemplateId(e.target.value);
                        setImage('');
                      }}
                    >
                      {allTemplates.map((t) => (
                        <option value={t.id} key={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="field-grid">
                    {(['countdown', 'delay', 'timeout'] as const).map((key) => (
                      <label className="field" key={key}>
                        <span>
                          {key === 'countdown'
                            ? 'Countdown (sec)'
                            : key === 'delay'
                              ? 'Between shots (sec)'
                              : 'Download timeout (sec)'}
                        </span>
                        <input
                          type="number"
                          min={key === 'timeout' ? 5 : 0}
                          max={key === 'timeout' ? 120 : 10}
                          value={settings[key]}
                          onChange={(e) => change({ [key]: Number(e.target.value) })}
                        />
                      </label>
                    ))}
                  </div>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={settings.retakes}
                      onChange={(e) => change({ retakes: e.target.checked })}
                    />{' '}
                    Allow retakes (originals retained)
                  </label>
                </section>
                <section>
                  <div className="section-heading">Print after capture</div>
                  {printerFields}
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={settings.autoPrint}
                      onChange={(e) => change({ autoPrint: e.target.checked })}
                    />{' '}
                    Automatically print completed sessions
                  </label>
                  {settings.autoPrint && (
                    <p className="hint">
                      Prints immediately after composition, before any retake review.
                    </p>
                  )}
                </section>
              </fieldset>
              <section>
                <Button
                  onClick={() =>
                    void work(async () => {
                      await api().saveCaptureSettings(settings);
                      setMessage('Capture and print settings saved locally.');
                    })
                  }
                >
                  <CheckCircle2 size={15} /> Save settings
                </Button>
              </section>
            </fieldset>
          </aside>
        </div>
      ) : (
        <div className="capture-history-grid">
          <div>
            <div className="section-heading">
              {page === 'Print Manager' ? 'Print queue & reprints' : 'Saved photo sessions'}
              <Button variant="secondary" size="sm" onClick={() => void work(refresh)}>
                Refresh
              </Button>
            </div>
            <input
              aria-label="Search sessions"
              placeholder="Search event, date, or session ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {page === 'Print Manager' && (
              <div className="print-jobs">
                {jobs.length ? (
                  jobs.map((j) => (
                    <div className="print-job" key={j.id}>
                      <strong>{j.status.toUpperCase()}</strong>
                      <span>
                        {j.printer} · {j.copies} copies · session {j.sessionId.slice(0, 8)}
                      </span>
                      {j.error && <p>{j.error}</p>}
                    </div>
                  ))
                ) : (
                  <p className="hint">No print jobs yet. Select a completed session below.</p>
                )}
              </div>
            )}
            <div className="session-list">
              {sessions
                .filter((s) =>
                  `${s.eventName} ${s.createdAt} ${s.id}`
                    .toLowerCase()
                    .includes(search.toLowerCase()),
                )
                .map((s) => (
                  <button
                    className={`session-row ${selected?.id === s.id ? 'selected' : ''}`}
                    key={s.id}
                    onClick={() => void work(() => showSession(s))}
                  >
                    <div>
                      <strong>{s.eventName}</strong>
                      <span>
                        {new Date(s.createdAt).toLocaleString()} · {s.template.name}
                      </span>
                      <small>
                        {s.source === 'demo' ? 'DEMO MODE · ' : ''}
                        {s.shots.length} originals · {s.id.slice(0, 8)}
                      </small>
                    </div>
                    <span className="badge">{s.status}</span>
                  </button>
                ))}
            </div>
            {sessions.length === 0 && (
              <div className="empty-state">Complete a capture session to see it here.</div>
            )}
          </div>
          <aside className="session-detail panel">
            <section>
              <div className="section-heading">Printer settings</div>
              {printerFields}
              <Button
                size="sm"
                onClick={() =>
                  void work(async () => {
                    await api().saveCaptureSettings(settings);
                    setMessage('Printer settings saved.');
                  })
                }
              >
                Save print settings
              </Button>
            </section>
            {selected && (
              <section>
                <h3>{selected.eventName}</h3>
                {image && (
                  <img
                    className="session-composition"
                    src={image}
                    alt="Selected session composition"
                  />
                )}
                <p className="hint">
                  {(selected.template.width / selected.template.dpi) *
                    (selected.template.duplicateStrip ? 2 : 1)}{' '}
                  × {selected.template.height / selected.template.dpi} inches ·{' '}
                  {selected.template.dpi} DPI
                </p>
                {selected.status === 'complete' ? (
                  <div className="session-buttons">
                    <Button
                      disabled={!settings.printer}
                      onClick={() => void work(() => print(selected))}
                    >
                      <Printer size={15} /> Print / reprint
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() =>
                        void work(async () => {
                          await api().exportSession(selected.id);
                        })
                      }
                    >
                      Export PNG
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() =>
                        void work(async () => {
                          await api().exportSessionPDF(selected.id);
                        })
                      }
                    >
                      Save print PDF
                    </Button>
                  </div>
                ) : (
                  ['interrupted', 'error'].includes(selected.status) && (
                    <Button
                      onClick={() =>
                        void work(async () => {
                          const s = await api().finishSession(selected.id);
                          await showSession(s);
                          await refresh();
                        })
                      }
                    >
                      Recover composition
                    </Button>
                  )
                )}
                <div className="shot-strip">
                  {photos.map((src, i) => (
                    <img src={src} alt={`Original ${i + 1}`} key={i} />
                  ))}
                </div>
                {selected.errors.map((e, i) => (
                  <p key={i} className="hint">
                    {e}
                  </p>
                ))}
              </section>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
