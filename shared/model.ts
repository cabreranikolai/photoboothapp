import { z } from 'zod';
import type { SessionAPI } from './sessions';
const coordinate = z.number().finite().min(-12000).max(12000);
export const layerSchema = z.object({
  id: z.string().uuid(),
  name: z.string().max(120),
  type: z.enum(['photo', 'image', 'text']),
  x: coordinate,
  y: coordinate,
  width: z.number().int().min(1).max(12000),
  height: z.number().int().min(1).max(12000),
  rotation: z.number().finite().min(-360).max(360),
  visible: z.boolean(),
  locked: z.boolean(),
  aspectLocked: z.boolean(),
  assetId: z.string().uuid().optional(),
  capture: z.number().int().min(1).max(20),
  fit: z.enum(['fill', 'fit']),
  cropX: z.number().min(0).max(1),
  cropY: z.number().min(0).max(1),
  radius: z.number().min(0).max(6000),
  border: z.number().min(0).max(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  text: z.string().max(1000),
  fontSize: z.number().min(8).max(1000),
});
export const templateSchema = z
  .object({
    version: z.literal(1),
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(120),
    width: z.number().int().min(100).max(7200),
    height: z.number().int().min(100).max(7200),
    dpi: z.number().int().min(72).max(600),
    background: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    layers: z.array(layerSchema).max(100),
    duplicateStrip: z.boolean(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .refine((t) => t.width * t.height <= 36_000_000, 'Canvas exceeds 36 megapixels');
export type Layer = z.infer<typeof layerSchema>;
export type Template = z.infer<typeof templateSchema>;
export interface Asset {
  id: string;
  name: string;
  width: number;
  height: number;
  dataUrl: string;
}
export interface StudioAPI extends SessionAPI {
  listTemplates(): Promise<Template[]>;
  saveTemplate(template: Template): Promise<void>;
  deleteTemplate(id: string): Promise<void>;
  importAsset(name: string, bytes: Uint8Array): Promise<Asset>;
  getAsset(id: string): Promise<Asset>;
  exportImage(template: Template): Promise<string | null>;
  exportTemplate(template: Template): Promise<boolean>;
  importTemplate(): Promise<Template | null>;
}
export function newLayer(type: Layer['type'], overrides: Partial<Layer> = {}): Layer {
  return {
    id: crypto.randomUUID(),
    name: type === 'photo' ? 'Photo slot' : type === 'text' ? 'Text' : 'Overlay',
    type,
    x: 90,
    y: 90,
    width: 450,
    height: 340,
    rotation: 0,
    visible: true,
    locked: false,
    aspectLocked: false,
    capture: 1,
    fit: 'fill',
    cropX: 0.5,
    cropY: 0.5,
    radius: 0,
    border: 0,
    color: '#ffffff',
    text: 'A moment to remember',
    fontSize: 44,
    ...overrides,
  };
}
