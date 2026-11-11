import { it, expect } from 'vitest';
import { createServer } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import { DigiCamBridge } from '../electron/camera/digicam';
it('uses documented digiCamControl commands, stops live view, and downloads a fresh complete JPEG', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'luma-dcc-'));
  const jpeg = await sharp({ create: { width: 100, height: 80, channels: 3, background: 'blue' } }).jpeg().toBuffer();
  const calls: string[] = [];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url!, 'http://localhost'); calls.push(url.search || url.pathname);
    if (url.pathname === '/liveview.jpg') { res.end(jpeg); return; }
    if (url.searchParams.get('slc') === 'list') { res.end('CAMERA-123\r\n'); return; }
    if (url.searchParams.get('slc') === 'capture') { await writeFile(url.searchParams.get('param1')!, jpeg); }
    res.end('OK');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  try {
    const bridge = new DigiCamBridge(`http://127.0.0.1:${port}`);
    expect(await bridge.detect()).toEqual(['CAMERA-123']); await bridge.connect('CAMERA-123');
    expect(await bridge.preview()).toMatch(/^data:image\/jpeg;base64,/);
    const result = await bridge.capture(path.join(root, 'new.jpg'), 5); expect(result).toEqual(jpeg);
    expect(calls.some(c => c.includes('LiveViewWnd_Hide'))).toBe(true);
    expect(calls.findIndex(c => c.includes('LiveViewWnd_Hide'))).toBeLessThan(calls.findIndex(c => c.includes('slc=capture')));
    await bridge.disconnect(); await expect(bridge.capture(path.join(root, 'other.jpg'), 5)).rejects.toThrow('Connect a DSLR');
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(root, { recursive: true, force: true }); }
});
