import { it, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { Storage } from '../electron/storage';
import { sampleTemplate } from '../shared/samples';
it('recovers editable documents and managed images after reopening SQLite', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'luma-storage-'));
  try {
    const db = new Storage(root);
    await db.init();
    const bytes = await sharp({
      create: { width: 50, height: 80, channels: 4, background: '#ff0000' },
    })
      .png()
      .toBuffer();
    const asset = await db.importAsset('sample.png', bytes),
      t = sampleTemplate();
    t.layers[0].assetId = asset.id;
    await db.save(t);
    const reopened = new Storage(root);
    await reopened.init();
    expect(reopened.list()).toEqual([t]);
    expect((await reopened.asset(asset.id)).width).toBe(50);
    await expect(reopened.bytes('../outside')).rejects.toThrow();
    await expect(reopened.importAsset('bad.png', Buffer.from('invalid'))).rejects.toThrow();
    await reopened.delete(t.id);
    expect(reopened.list()).toEqual([]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
