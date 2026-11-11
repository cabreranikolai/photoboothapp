import { z } from 'zod';
import type { Template } from './model';
export const captureSettingsSchema = z.object({
  source: z.enum(['webcam', 'digicam', 'demo']),
  deviceId: z.string().max(300),
  mirror: z.boolean().default(false),
  eventName: z.string().trim().min(1).max(100),
  countdown: z.number().int().min(0).max(10),
  delay: z.number().int().min(0).max(10),
  timeout: z.number().int().min(5).max(120),
  retakes: z.boolean(),
  autoPrint: z.boolean(),
  printer: z.string().max(300),
  copies: z.number().int().min(1).max(10),
});
export type CaptureSettings = z.infer<typeof captureSettingsSchema>;
export const defaultCaptureSettings: CaptureSettings = {
  source: 'webcam',
  deviceId: '',
  mirror: false,
  eventName: 'My event',
  countdown: 3,
  delay: 1,
  timeout: 30,
  retakes: true,
  autoPrint: false,
  printer: '',
  copies: 1,
};
export interface Shot {
  capture: number;
  assetId: string;
  original: string;
  takenAt: string;
}
export interface PhotoSession {
  id: string;
  eventName: string;
  source: CaptureSettings['source'];
  mirror?: boolean;
  template: Template;
  createdAt: string;
  status: 'capturing' | 'composing' | 'complete' | 'cancelled' | 'error' | 'interrupted';
  shots: Shot[];
  selected: Record<string, string>;
  output?: string;
  errors: string[];
}
export interface PrintJob {
  id: string;
  sessionId: string;
  printer: string;
  copies: number;
  createdAt: string;
  status: 'queued' | 'submitting' | 'submitted' | 'failed' | 'unknown';
  error?: string;
}
export interface LocalPrinter {
  name: string;
  displayName: string;
  isDefault: boolean;
  status: number;
}
export interface SessionAPI {
  getCaptureSettings(): Promise<CaptureSettings>;
  saveCaptureSettings(settings: CaptureSettings): Promise<void>;
  beginSession(template: Template, settings: CaptureSettings): Promise<PhotoSession>;
  captureShot(id: string, capture: number, bytes?: Uint8Array): Promise<PhotoSession>;
  finishSession(id: string): Promise<PhotoSession>;
  cancelSession(id: string): Promise<PhotoSession>;
  listSessions(): Promise<PhotoSession[]>;
  sessionImage(id: string): Promise<string>;
  exportSession(id: string): Promise<boolean>;
  listPrinters(): Promise<LocalPrinter[]>;
  printSession(id: string, printer: string, copies: number): Promise<PrintJob>;
  listPrintJobs(): Promise<PrintJob[]>;
  exportSessionPDF(id: string): Promise<boolean>;
  detectDSLR(): Promise<string[]>;
  connectDSLR(id: string): Promise<void>;
  disconnectDSLR(): Promise<void>;
  dslrPreview(): Promise<string>;
}
