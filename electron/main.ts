import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { Storage, atomicWrite } from './storage';
import { compose } from './composition';
import { templateSchema, type Template } from '../shared/model';
import { z } from 'zod';
import { registerSessions } from './session-ipc';
let window: BrowserWindow;
if (process.env.LUMA_TEST_DATA) app.setPath('userData', process.env.LUMA_TEST_DATA);
app
  .whenReady()
  .then(async () => {
    const storage = new Storage(path.join(app.getPath('userData'), 'studio'));
    await storage.init();
    const entry = path.join(__dirname, '../dist/index.html');
    const url = process.env.LUMA_DEV === '1' ? 'http://127.0.0.1:5173/' : pathToFileURL(entry).href;
    window = new BrowserWindow({
      width: 1536,
      height: 980,
      minWidth: 1100,
      minHeight: 720,
      backgroundColor: '#111514',
      title: 'Luma Photobooth',
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    window.setMenuBarVisibility(false);
    window.webContents.on('will-prevent-unload', (event) => {
      const choice = dialog.showMessageBoxSync(window, {
        type: 'warning',
        buttons: ['Keep editing', 'Discard changes'],
        defaultId: 0,
        cancelId: 0,
        title: 'Unsaved template',
        message: 'Close without saving your template changes?',
      });
      if (choice === 1) event.preventDefault();
    });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event, target) => {
      if (target !== url) event.preventDefault();
    });
    window.webContents.session.setPermissionRequestHandler(
      (contents, permission, callback, details) =>
        callback(
          contents === window.webContents &&
            contents.getURL() === url &&
            permission === 'media' &&
            'mediaTypes' in details &&
            details.mediaTypes?.every((t: string) => t === 'video') === true,
        ),
    );
    window.webContents.session.setPermissionCheckHandler(
      (contents, permission) =>
        contents === window.webContents && contents.getURL() === url && permission === 'media',
    );
    function handle(channel: string, handler: (...args: any[]) => unknown) {
      ipcMain.handle(channel, (event, ...args: unknown[]) => {
        if (
          event.sender !== window.webContents ||
          event.senderFrame !== window.webContents.mainFrame ||
          event.senderFrame?.url !== url
        )
          throw new Error('Untrusted request');
        return handler(...args);
      });
    }
    handle('templates:list', () => storage.list());
    handle('templates:save', (t: Template) => storage.save(t));
    handle('templates:delete', (id: string) => storage.delete(id));
    handle('assets:import', (name: string, bytes: Uint8Array) => storage.importAsset(name, bytes));
    handle('assets:get', (id: string) => storage.asset(id));
    handle('composition:export', async (input: Template) => {
      const t = templateSchema.parse(input);
      const output = await dialog.showSaveDialog(window, {
        title: 'Export print-ready composition',
        defaultPath: `${t.name.replace(/[^a-z0-9 -]/gi, '')}.png`,
        filters: [{ name: 'PNG image', extensions: ['png'] }],
      });
      if (output.canceled || !output.filePath) return null;
      await atomicWrite(output.filePath, await compose(t, (id) => storage.bytes(id)));
      return output.filePath;
    });
    handle('templates:export', async (input: Template) => {
      const template = templateSchema.parse(input);
      const result = await dialog.showSaveDialog(window, {
        defaultPath: `${template.name.replace(/[^a-z0-9 -]/gi, '')}.luma.json`,
        filters: [{ name: 'Luma template', extensions: ['json'] }],
      });
      if (result.canceled || !result.filePath) return false;
      const assets: Record<string, string> = {};
      for (const l of template.layers)
        if (l.assetId && !assets[l.assetId])
          assets[l.assetId] = (await storage.bytes(l.assetId)).toString('base64');
      await atomicWrite(result.filePath, JSON.stringify({ template, assets }));
      return true;
    });
    handle('templates:import', async () => {
      const result = await dialog.showOpenDialog(window, {
        filters: [{ name: 'Luma template', extensions: ['json'] }],
        properties: ['openFile'],
      });
      if (result.canceled) return null;
      const stat = await fs.stat(result.filePaths[0]);
      if (stat.size > 150 * 1024 * 1024) throw new Error('Template package exceeds 150 MB.');
      const bundle = z
        .object({ template: templateSchema, assets: z.record(z.uuid(), z.string()) })
        .parse(JSON.parse(await fs.readFile(result.filePaths[0], 'utf8')));
      const mapping = new Map<string, string>();
      for (const l of bundle.template.layers)
        if (l.assetId && !mapping.has(l.assetId)) {
          if (!bundle.assets[l.assetId]) throw new Error(`Missing packaged asset for ${l.name}`);
          mapping.set(
            l.assetId,
            (await storage.importAsset(l.name, Buffer.from(bundle.assets[l.assetId], 'base64'))).id,
          );
        }
      const t = {
        ...bundle.template,
        id: crypto.randomUUID(),
        updatedAt: new Date().toISOString(),
        layers: bundle.template.layers.map((l) => ({
          ...l,
          assetId: l.assetId ? mapping.get(l.assetId) : undefined,
        })),
      };
      await storage.save(t);
      return t;
    });
    await registerSessions(handle, storage, window);
    await window.loadURL(url);
  })
  .catch((error) => {
    dialog.showErrorBox('Luma could not start', String(error));
    app.quit();
  });
app.on('window-all-closed', () => app.quit());
