import { promises as fs } from 'node:fs';
import sharp from 'sharp';
/** Local digiCamControl web bridge. Never falls back to a demo camera. */
export class DigiCamBridge {
  constructor(private readonly endpoint = 'http://127.0.0.1:5513') {}
  private camera = '';
  private live = false;
  private busy = false;
  private async request(params: Record<string, string>, signal?: AbortSignal) {
    const response = await fetch(`${this.endpoint}/?${new URLSearchParams(params)}`, {
      signal: signal ?? AbortSignal.timeout(5000),
      redirect: 'error',
    });
    if (!response.ok) throw new Error(`digiCamControl HTTP ${response.status}`);
    const text = (await response.text()).trim();
    if (/^error|exception|<!doctype|<html/i.test(text))
      throw new Error(`digiCamControl: ${text.slice(0, 200)}`);
    return text;
  }
  async detect() {
    const text = await this.request({ slc: 'list', param1: 'cameras' });
    return text
      .split(/[\r\n]+/)
      .map((s) => s.trim())
      .filter((s) => s && s !== 'OK');
  }
  async connect(id: string) {
    if (this.busy) throw new Error('Capture is still in progress.');
    const cameras = await this.detect();
    if (!cameras.includes(id)) throw new Error('Selected DSLR is not connected in digiCamControl.');
    await this.request({ slc: 'set', param1: 'camera', param2: id });
    this.camera = id;
    // Live view can be unsupported even when tethered capture is available.
    this.live = false;
  }
  async disconnect() {
    if (this.busy) throw new Error('Wait for the current capture to finish.');
    if (this.live) await this.request({ CMD: 'LiveViewWnd_Hide' });
    this.camera = '';
    this.live = false;
  }
  async preview() {
    if (!this.camera) throw new Error('Connect a DSLR first.');
    if (this.busy) throw new Error('DSLR is downloading a photo.');
    if (!this.live) {
      await this.request({ CMD: 'LiveViewWnd_Show' });
      this.live = true;
    }
    const response = await fetch(`${this.endpoint}/liveview.jpg`, {
      signal: AbortSignal.timeout(5000),
      redirect: 'error',
    });
    if (!response.ok) throw new Error('Live view is unavailable on this camera.');
    const bytes = Buffer.from(await response.arrayBuffer());
    const jpeg = await sharp(bytes, { limitInputPixels: 20_000_000 })
      .resize({ width: 1000, withoutEnlargement: true })
      .jpeg()
      .toBuffer();
    return `data:image/jpeg;base64,${jpeg.toString('base64')}`;
  }
  async capture(destination: string, timeout: number) {
    if (!this.camera) throw new Error('Connect a DSLR in Camera Settings first.');
    if (this.busy) throw new Error('A DSLR capture is already running.');
    this.busy = true;
    try {
      if (this.live) {
        await this.request({ CMD: 'LiveViewWnd_Hide' });
        this.live = false;
      }
      const signal = AbortSignal.timeout(timeout * 1000);
      await this.request({ slc: 'capture', param1: destination, camera: this.camera }, signal);
      // Unique destination prevents accepting an older shot. Wait for a complete JPEG.
      let previousSize = -1;
      while (!signal.aborted) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        try {
          const bytes = await fs.readFile(destination);
          if (
            bytes.length === previousSize &&
            bytes.length > 100 &&
            bytes.at(-2) === 0xff &&
            bytes.at(-1) === 0xd9
          ) {
            const meta = await sharp(bytes, { limitInputPixels: 60_000_000 }).metadata();
            if (meta.format === 'jpeg') return bytes;
          }
          previousSize = bytes.length;
        } catch (e) {
          if (
            (e as NodeJS.ErrnoException).code !== 'ENOENT' &&
            (e as NodeJS.ErrnoException).code !== 'EBUSY'
          )
            throw e;
        }
      }
      throw new Error(
        'DSLR download timed out. Check camera, JPEG transfer, and digiCamControl; reconnect before retrying.',
      );
    } catch (e) {
      this.camera = '';
      throw e;
    } finally {
      this.busy = false;
    }
  }
}
