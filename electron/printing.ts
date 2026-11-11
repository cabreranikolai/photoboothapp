import { BrowserWindow } from 'electron';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { PhotoSession, PrintJob } from '../shared/sessions';
import { SessionService } from './sessions';
import { Storage } from './storage';
export function paperSize(s: PhotoSession) {
  return {
    width: (s.template.width * (s.template.duplicateStrip ? 2 : 1)) / s.template.dpi,
    height: s.template.height / s.template.dpi,
  };
}
export function printHTML(s: PhotoSession, png: Buffer) {
  const { width, height } = paperSize(s);
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><style>@page{size:${width}in ${height}in;margin:0}*{box-sizing:border-box}html,body{padding:0;margin:0;width:${width}in;height:${height}in;overflow:hidden}img{display:block;width:100%;height:100%;object-fit:contain;print-color-adjust:exact;-webkit-print-color-adjust:exact}</style></head><body><img src="data:image/png;base64,${png.toString('base64')}"/></body></html>`;
}
async function printWindow(s: PhotoSession, bytes: Buffer) {
  const win = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(printHTML(s, bytes))}`);
    await win.webContents.executeJavaScript('document.images[0].decode()');
    return win;
  } catch (e) {
    win.destroy();
    throw e;
  }
}
export interface PrintDriver {
  submit(s: PhotoSession, bytes: Buffer, printer: string, copies: number): Promise<void>;
}
export class NativePrintDriver implements PrintDriver {
  async submit(s: PhotoSession, bytes: Buffer, printer: string, copies: number) {
    const win = await printWindow(s, bytes);
    try {
      if (!(await win.webContents.getPrintersAsync()).some((p) => p.name === printer))
        throw new Error('Selected printer is no longer installed.');
      const { width, height } = paperSize(s);
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () =>
            reject(
              new Error(
                'Print submission timed out; delivery is unknown. Check Windows queue before reprinting.',
              ),
            ),
          60000,
        );
        try {
          win.webContents.print(
            {
              silent: true,
              deviceName: printer,
              copies,
              printBackground: true,
              margins: { marginType: 'none' },
              pageSize: {
                width: Math.round(Math.min(width, height) * 25400),
                height: Math.round(Math.max(width, height) * 25400),
              },
              landscape: width > height,
              scaleFactor: 100,
            },
            (success, reason) => {
              clearTimeout(timeout);
              success ? resolve() : reject(new Error(reason || 'Windows rejected the print job.'));
            },
          );
        } catch (e) {
          clearTimeout(timeout);
          reject(e);
        }
      });
    } finally {
      win.destroy();
    }
  }
}
export class PrintService {
  private queue = Promise.resolve();
  private pending = new Set<string>();
  constructor(
    private storage: Storage,
    private sessions: SessionService,
    private driver: PrintDriver = new NativePrintDriver(),
  ) {}
  list() {
    return this.storage.records<PrintJob>('print');
  }
  async init() {
    for (const j of this.list())
      if (j.status === 'queued' || j.status === 'submitting') {
        j.status = 'unknown';
        j.error = 'App restarted. Check Windows print queue before reprinting.';
        await this.save(j);
      }
  }
  private save(j: PrintJob) {
    return this.storage.putRecord('print', j.id, j);
  }
  async enqueue(id: string, printer: string, copies: number) {
    z.string().min(1).max(300).parse(printer);
    z.number().int().min(1).max(10).parse(copies);
    const s = this.sessions.get(id);
    if (s.status !== 'complete') throw new Error('Finish the session before printing.');
    if (
      this.pending.has(id) ||
      this.list().some((j) => j.sessionId === id && ['queued', 'submitting'].includes(j.status))
    )
      throw new Error('This session is already queued for printing.');
    this.pending.add(id);
    const job: PrintJob = {
      id: randomUUID(),
      sessionId: id,
      printer,
      copies,
      createdAt: new Date().toISOString(),
      status: 'queued',
    };
    try {
      await this.save(job);
    } catch (error) {
      this.pending.delete(id);
      throw error;
    }
    this.queue = this.queue
      .then(async () => {
        try {
          job.status = 'submitting';
          await this.save(job);
          await this.driver.submit(s, await this.sessions.output(id), printer, copies);
          job.status = 'submitted';
        } catch (e) {
          job.error = String(e);
          job.status = job.error.includes('timed out') ? 'unknown' : 'failed';
        }
        await this.save(job);
      })
      .catch((error) => {
        console.error('Unable to persist print status:', error);
      })
      .finally(() => {
        this.pending.delete(id);
      });
    return { ...job };
  }
  async idle() {
    await this.queue;
  }
  async pdf(id: string) {
    const win = await printWindow(this.sessions.get(id), await this.sessions.output(id));
    try {
      return await win.webContents.printToPDF({
        printBackground: true,
        preferCSSPageSize: true,
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
      });
    } finally {
      win.destroy();
    }
  }
}
