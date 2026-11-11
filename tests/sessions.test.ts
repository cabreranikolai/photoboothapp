import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
vi.mock('electron', () => ({ BrowserWindow: class {} }));
import { Storage } from '../electron/storage';
import { SessionService } from '../electron/sessions';
import { PrintService, paperSize } from '../electron/printing';
import { DigiCamBridge } from '../electron/camera/digicam';
import { defaultCaptureSettings, captureSettingsSchema } from '../shared/sessions';
import { sampleTemplate } from '../shared/samples';
let root: string, storage: Storage, service: SessionService;
const settings = { ...defaultCaptureSettings, source: 'demo' as const, countdown: 0, delay: 0 };
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'luma-session-'));
  storage = new Storage(root);
  await storage.init();
  service = new SessionService(storage, new DigiCamBridge());
  await service.init();
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});
async function completed() {
  const s = await service.begin(sampleTemplate(), settings);
  for (let i = 1; i <= 4; i++) await service.capture(s.id, i);
  return service.finish(s.id);
}
describe('capture sessions', () => {
  it('mirrors captured composition assets only when enabled and keeps original bytes intact', async () => {
    const jpeg = await sharp(
      Buffer.from(
        '<svg width="100" height="80"><rect width="50" height="80" fill="red"/><rect x="50" width="50" height="80" fill="blue"/></svg>',
      ),
    )
      .jpeg()
      .toBuffer();
    for (const mirror of [false, true]) {
      const s = await service.begin(sampleTemplate(), { ...settings, source: 'webcam', mirror });
      const result = await service.capture(s.id, 1, jpeg);
      const bytes = await storage.bytes(result.selected['1']);
      const pixel = await sharp(bytes)
        .extract({ left: 10, top: 40, width: 1, height: 1 })
        .removeAlpha()
        .raw()
        .toBuffer();
      expect(pixel[mirror ? 2 : 0]).toBeGreaterThan(240);
      expect(pixel[mirror ? 0 : 2]).toBeLessThan(15);
      expect(result.mirror).toBe(mirror);
      expect(await readFile(path.join(service.folder(result), result.shots[0].original))).toEqual(
        jpeg,
      );
      await service.cancel(s.id);
    }
    const { mirror: _mirror, ...legacy } = settings;
    expect(captureSettingsSchema.parse(legacy).mirror).toBe(false);
  });
  it('saves originals before composing, uses all captures and preserves retakes', async () => {
    const s = await service.begin(sampleTemplate(), settings);
    await expect(service.finish(s.id)).rejects.toThrow('missing');
    for (let i = 1; i <= 4; i++) await service.capture(s.id, i);
    const first = service.get(s.id).selected['1'];
    await service.capture(s.id, 1);
    const done = await service.finish(s.id);
    expect(done.status).toBe('complete');
    expect(done.shots).toHaveLength(5);
    expect(done.selected['1']).not.toBe(first);
    expect(await readdir(path.join(service.folder(done), 'originals'))).toHaveLength(5);
    const meta = await sharp(await service.output(done.id)).metadata();
    expect([meta.width, meta.height, meta.density]).toEqual([1200, 1800, 300]);
    const reopened = new SessionService(storage, new DigiCamBridge());
    await reopened.init();
    expect(reopened.get(done.id).status).toBe('complete');
  });
  it('rejects concurrent capture/start, invalid capture numbers and disabled retakes', async () => {
    const s = await service.begin(sampleTemplate(), { ...settings, retakes: false });
    await expect(service.begin(sampleTemplate(), settings)).rejects.toThrow('current session');
    const pending = service.capture(s.id, 1);
    await expect(service.capture(s.id, 1)).rejects.toThrow('already running');
    await pending;
    await expect(service.capture(s.id, 1)).rejects.toThrow('Retakes are disabled');
    await expect(service.capture(s.id, 5)).rejects.toThrow('not used');
    await service.cancel(s.id);
    expect(service.get(s.id).status).toBe('cancelled');
    expect(service.get(s.id).shots).toHaveLength(1);
  });
  it('recovers interrupted fully captured sessions and never substitutes designer samples', async () => {
    const s = await service.begin(sampleTemplate(), settings);
    for (let n = 1; n <= 4; n++) await service.capture(s.id, n);
    const reopened = new SessionService(storage, new DigiCamBridge());
    await reopened.init();
    expect(reopened.get(s.id).status).toBe('interrupted');
    expect((await reopened.finish(s.id)).status).toBe('complete');
  });
  it('preserves original webcam bytes exactly and rejects invalid images', async () => {
    const s = await service.begin(sampleTemplate(), { ...settings, source: 'webcam' });
    await expect(service.capture(s.id, 1, new Uint8Array([1, 2, 3]))).rejects.toThrow();
    const jpeg = await sharp({
      create: { width: 640, height: 480, channels: 3, background: '#123456' },
    })
      .jpeg()
      .toBuffer();
    const shot = await service.capture(s.id, 1, jpeg);
    expect(await readFile(path.join(service.folder(shot), shot.shots[0].original))).toEqual(jpeg);
    expect(shot.errors).toHaveLength(1);
    await service.cancel(s.id);
  });
});
describe('print queue', () => {
  it('serializes real driver submissions, blocks duplicate clicks and records submitted copies', async () => {
    const s = await completed();
    let release!: () => void;
    const submit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const printing = new PrintService(storage, service, { submit });
    const job = await printing.enqueue(s.id, 'Test printer', 2);
    await expect(printing.enqueue(s.id, 'Test printer', 2)).rejects.toThrow('already queued');
    await vi.waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    release();
    await printing.idle();
    expect(printing.list().find((j) => j.id === job.id)).toMatchObject({
      status: 'submitted',
      copies: 2,
    });
    expect(paperSize(s)).toEqual({ width: 4, height: 6 });
  });
  it('reports failed printers and marks restart submissions unknown rather than printing twice', async () => {
    const s = await completed();
    const printing = new PrintService(storage, service, {
      submit: async () => {
        throw new Error('Printer offline');
      },
    });
    await printing.enqueue(s.id, 'Offline', 1);
    await printing.idle();
    expect(printing.list()[0]).toMatchObject({ status: 'failed', error: 'Error: Printer offline' });
    const j = printing.list()[0];
    await storage.putRecord('print', j.id, { ...j, status: 'submitting' });
    await printing.init();
    expect(printing.list()[0].status).toBe('unknown');
    await expect(printing.enqueue(s.id, '', 1)).rejects.toThrow();
    await expect(printing.enqueue(s.id, 'Printer', 0)).rejects.toThrow();
  });
});
