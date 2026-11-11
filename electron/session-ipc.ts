import { BrowserWindow, dialog } from 'electron';
import { z } from 'zod';
import { Storage, atomicWrite } from './storage';
import { SessionService } from './sessions';
import { PrintService } from './printing';
import { DigiCamBridge } from './camera/digicam';
import {
  captureSettingsSchema,
  defaultCaptureSettings,
  type CaptureSettings,
} from '../shared/sessions';
type Handle = (channel: string, handler: (...args: any[]) => unknown) => void;
export async function registerSessions(handle: Handle, storage: Storage, window: BrowserWindow) {
  const camera = new DigiCamBridge(),
    sessions = new SessionService(storage, camera),
    printing = new PrintService(storage, sessions);
  await sessions.init();
  await printing.init();
  handle('capture:settings', () =>
    captureSettingsSchema.parse(
      storage.records<CaptureSettings>('settings')[0] ?? defaultCaptureSettings,
    ),
  );
  handle('capture:configure', (s: CaptureSettings) =>
    storage.putRecord('settings', 'capture', captureSettingsSchema.parse(s)),
  );
  handle('sessions:begin', (t, s) => sessions.begin(t, s));
  handle('sessions:capture', (id, n, bytes) => sessions.capture(id, n, bytes));
  handle('sessions:finish', (id) => sessions.finish(id));
  handle('sessions:cancel', (id) => sessions.cancel(id));
  handle('sessions:list', () => sessions.list());
  handle(
    'sessions:image',
    async (id) => `data:image/png;base64,${(await sessions.output(id)).toString('base64')}`,
  );
  handle('sessions:export', async (id) => {
    const bytes = await sessions.output(id);
    const out = await dialog.showSaveDialog(window, {
      defaultPath: `session-${id}.png`,
      filters: [{ name: 'PNG', extensions: ['png'] }],
    });
    if (out.canceled || !out.filePath) return false;
    await atomicWrite(out.filePath, bytes);
    return true;
  });
  handle('printers:list', async () =>
    (await window.webContents.getPrintersAsync()).map((p) => ({
      name: p.name,
      displayName: p.displayName,
      isDefault: 'isDefault' in p ? Boolean(p.isDefault) : false,
      status: 'status' in p ? Number(p.status) : 0,
    })),
  );
  handle('prints:list', () => printing.list());
  handle('prints:submit', async (id, printer, copies) => {
    if (!(await window.webContents.getPrintersAsync()).some((p) => p.name === printer))
      throw new Error('Select an installed printer first.');
    return printing.enqueue(id, printer, copies);
  });
  handle('prints:pdf', async (id) => {
    z.uuid().parse(id);
    const out = await dialog.showSaveDialog(window, {
      defaultPath: `session-${id}.pdf`,
      filters: [{ name: 'Print-ready PDF', extensions: ['pdf'] }],
    });
    if (out.canceled || !out.filePath) return false;
    await atomicWrite(out.filePath, await printing.pdf(id));
    return true;
  });
  handle('camera:detect', () => camera.detect());
  handle('camera:connect', (id) => camera.connect(z.string().min(1).max(300).parse(id)));
  handle('camera:disconnect', () => camera.disconnect());
  handle('camera:preview', () => camera.preview());
}
