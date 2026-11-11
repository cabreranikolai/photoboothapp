import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { z } from 'zod';
import { Storage, atomicWrite } from './storage';
import { compose } from './composition';
import { templateSchema, type Template } from '../shared/model';
import { captureSettingsSchema, type CaptureSettings, type PhotoSession } from '../shared/sessions';
import { DigiCamBridge } from './camera/digicam';
export class SessionService {
  private busy = false;
  private active?: string;
  private settings = new Map<string, CaptureSettings>();
  constructor(
    readonly storage: Storage,
    readonly camera: DigiCamBridge,
  ) {}
  async init() {
    for (const s of this.list())
      if (['capturing', 'composing'].includes(s.status)) {
        s.status = 'interrupted';
        s.errors.push('App closed during session. Original photos were retained.');
        await this.persist(s);
      }
  }
  list() {
    return this.storage.records<PhotoSession>('session');
  }
  get(id: string) {
    z.uuid().parse(id);
    const s = this.list().find((s) => s.id === id);
    if (!s) throw new Error('Session not found.');
    return s;
  }
  folder(s: PhotoSession) {
    return path.join(this.storage.root, 'events', s.createdAt.slice(0, 10), s.id);
  }
  private persist(s: PhotoSession) {
    return this.storage.putRecord('session', s.id, s);
  }
  async begin(input: Template, options: CaptureSettings) {
    if (this.active || this.busy) throw new Error('Finish or cancel the current session first.');
    const template = templateSchema.parse(input),
      settings = captureSettingsSchema.parse(options);
    if (!template.layers.some((l) => l.type === 'photo' && l.visible))
      throw new Error('The template needs at least one visible photo slot.');
    const s: PhotoSession = {
      id: randomUUID(),
      eventName: settings.eventName,
      source: settings.source,
      mirror: settings.mirror,
      template: structuredClone(template),
      createdAt: new Date().toISOString(),
      status: 'capturing',
      shots: [],
      selected: {},
      errors: [],
    };
    this.active = s.id;
    this.settings.set(s.id, settings);
    try {
      await fs.mkdir(path.join(this.folder(s), 'originals'), { recursive: true });
      await this.persist(s);
      return s;
    } catch (e) {
      this.active = undefined;
      throw e;
    }
  }
  async capture(id: string, capture: number, raw?: Uint8Array) {
    if (this.busy) throw new Error('A capture or composition is already running.');
    const s = this.get(id),
      settings = this.settings.get(id);
    if (this.active !== id || s.status !== 'capturing' || !settings)
      throw new Error('This session is not accepting captures.');
    z.number().int().min(1).max(20).parse(capture);
    if (!s.template.layers.some((l) => l.type === 'photo' && l.visible && l.capture === capture))
      throw new Error('Capture number is not used by this template.');
    if (s.selected[capture] && !settings.retakes) throw new Error('Retakes are disabled.');
    this.busy = true;
    try {
      const original = `originals/${capture}-${randomUUID()}.jpg`,
        filename = path.join(this.folder(s), original);
      let bytes: Buffer;
      if (s.source === 'digicam') bytes = await this.camera.capture(filename, settings.timeout);
      else if (s.source === 'demo') {
        bytes = await sharp(
          Buffer.from(
            `<svg width="1600" height="1200"><rect width="100%" height="100%" fill="${['#38624e', '#536b8c', '#936f4a', '#764c65'][(capture - 1) % 4]}"/><circle cx="800" cy="410" r="170" fill="#ffffff30"/><ellipse cx="800" cy="1080" rx="420" ry="430" fill="#ffffff30"/><text x="800" y="90" text-anchor="middle" font-size="50" fill="white">DEMO MODE — PHOTO ${capture}</text></svg>`,
          ),
        )
          .jpeg({ quality: 95 })
          .toBuffer();
      } else {
        if (!(raw instanceof Uint8Array) || raw.length > 40 * 1024 * 1024)
          throw new Error('Invalid webcam frame (maximum 40 MB).');
        bytes = Buffer.from(raw);
        if ((await sharp(bytes, { limitInputPixels: 60_000_000 }).metadata()).format !== 'jpeg')
          throw new Error('Webcam must supply a JPEG frame.');
      }
      // Journal originals before any normalization or rendering. Retakes get new filenames.
      await atomicWrite(filename, bytes);
      // Orient before mirroring so EXIF-rotated DSLR photos flip horizontally on screen.
      // Preserve the untouched original above; only the composition asset is mirrored.
      const compositionBytes = settings.mirror
        ? await sharp(await sharp(bytes).autoOrient().toBuffer())
            .flop()
            .png()
            .toBuffer()
        : bytes;
      const asset = await this.storage.importAsset(`Capture ${capture}`, compositionBytes);
      s.shots.push({ capture, assetId: asset.id, original, takenAt: new Date().toISOString() });
      s.selected[capture] = asset.id;
      await this.persist(s);
      return s;
    } catch (e) {
      s.errors.push(String(e));
      await this.persist(s);
      throw e;
    } finally {
      this.busy = false;
    }
  }
  async finish(id: string) {
    if (this.busy) throw new Error('Wait for the current operation.');
    const s = this.get(id);
    if (!['capturing', 'error', 'interrupted'].includes(s.status))
      throw new Error('Session cannot be composed in its current state.');
    if (this.active && this.active !== id) throw new Error('Another capture session is active.');
    const template = structuredClone(s.template);
    for (const l of template.layers)
      if (l.type === 'photo' && l.visible) {
        if (!s.selected[l.capture])
          throw new Error(
            `Capture ${l.capture} is missing. Start a new session; originals remain in history.`,
          );
        l.assetId = s.selected[l.capture];
      }
    this.busy = true;
    try {
      s.status = 'composing';
      await this.persist(s);
      const filename = 'composition.png';
      await atomicWrite(
        path.join(this.folder(s), filename),
        await compose(template, (id) => this.storage.bytes(id)),
      );
      s.output = filename;
      s.status = 'complete';
      await this.persist(s);
      return s;
    } catch (e) {
      s.status = 'error';
      s.errors.push(String(e));
      await this.persist(s);
      throw e;
    } finally {
      this.busy = false;
      if (this.active === id) this.active = undefined;
      this.settings.delete(id);
    }
  }
  async cancel(id: string) {
    if (this.busy)
      throw new Error('Wait for the current download to finish or time out before cancelling.');
    const s = this.get(id);
    if (s.status === 'complete') return s;
    s.status = 'cancelled';
    await this.persist(s);
    if (this.active === id) this.active = undefined;
    this.settings.delete(id);
    return s;
  }
  async output(id: string) {
    const s = this.get(id);
    if (!s.output || s.status !== 'complete')
      throw new Error('This session has no completed composition.');
    return fs.readFile(path.join(this.folder(s), 'composition.png'));
  }
}
