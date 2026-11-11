import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import initSqlJs, { type Database } from 'sql.js';
import sharp from 'sharp';
import { z } from 'zod';
import { templateSchema, type Template, type Asset } from '../shared/model';
export async function atomicWrite(filename: string, data: Uint8Array | string) {
  const temp = `${filename}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temp, data, { flag: 'wx' });
    await fs.rename(temp, filename);
  } finally {
    await fs.rm(temp, { force: true }).catch(() => {});
  }
}
export class Storage {
  private db!: Database;
  private queue = Promise.resolve();
  constructor(readonly root: string) {}
  async init() {
    await fs.mkdir(path.join(this.root, 'assets'), { recursive: true });
    const SQL = await initSqlJs({ locateFile: () => require.resolve('sql.js/dist/sql-wasm.wasm') });
    let existing: Buffer | undefined;
    try {
      existing = await fs.readFile(path.join(this.root, 'studio.sqlite'));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
    this.db = new SQL.Database(existing);
    // Migration 1: editable documents and managed asset metadata.
    this.db.run(
      'CREATE TABLE IF NOT EXISTS templates (id TEXT PRIMARY KEY, document TEXT NOT NULL); CREATE TABLE IF NOT EXISTS assets (id TEXT PRIMARY KEY, name TEXT NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS records (kind TEXT NOT NULL, id TEXT NOT NULL, document TEXT NOT NULL, PRIMARY KEY (kind,id)); PRAGMA user_version = 2;',
    );
    await this.flush();
  }
  private flush() {
    const snapshot = this.db.export();
    const write = this.queue.then(() =>
      atomicWrite(path.join(this.root, 'studio.sqlite'), snapshot),
    );
    this.queue = write.catch(() => {});
    return write;
  }
  records<T>(kind: string): T[] {
    const stmt = this.db.prepare('SELECT document FROM records WHERE kind = ? ORDER BY rowid DESC');
    try {
      stmt.bind([kind]);
      const rows: T[] = [];
      while (stmt.step()) rows.push(JSON.parse(String(stmt.get()[0])) as T);
      return rows;
    } finally {
      stmt.free();
    }
  }
  async putRecord(kind: string, id: string, value: unknown) {
    this.db.run('INSERT OR REPLACE INTO records VALUES (?, ?, ?)', [
      kind,
      id,
      JSON.stringify(value),
    ]);
    await this.flush();
  }
  list(): Template[] {
    const result = this.db.exec('SELECT document FROM templates ORDER BY rowid DESC');
    return (result[0]?.values ?? []).map((row) => templateSchema.parse(JSON.parse(String(row[0]))));
  }
  async save(input: Template) {
    const t = templateSchema.parse(input);
    for (const l of t.layers) if (l.assetId) await this.bytes(l.assetId);
    this.db.run('INSERT OR REPLACE INTO templates (id, document) VALUES (?, ?)', [
      t.id,
      JSON.stringify(t),
    ]);
    await this.flush();
  }
  async delete(id: string) {
    this.db.run('DELETE FROM templates WHERE id = ?', [z.uuid().parse(id)]);
    await this.flush();
  }
  async importAsset(name: string, raw: Uint8Array): Promise<Asset> {
    if (!(raw instanceof Uint8Array) || raw.byteLength > 40 * 1024 * 1024)
      throw new Error('Images must be smaller than 40 MB.');
    const image = sharp(Buffer.from(raw), { limitInputPixels: 60_000_000 });
    const meta = await image.metadata();
    if (!['png', 'jpeg'].includes(meta.format ?? ''))
      throw new Error('Please use a PNG or JPEG image.');
    const { data, info } = await image.autoOrient().png().toBuffer({ resolveWithObject: true });
    const id = randomUUID(),
      safeName = path.basename(String(name)).slice(0, 120);
    await atomicWrite(path.join(this.root, 'assets', `${id}.png`), data);
    this.db.run('INSERT INTO assets VALUES (?, ?, ?, ?)', [id, safeName, info.width, info.height]);
    await this.flush();
    return {
      id,
      name: safeName,
      width: info.width,
      height: info.height,
      dataUrl: `data:image/png;base64,${data.toString('base64')}`,
    };
  }
  async bytes(id: string) {
    return fs.readFile(path.join(this.root, 'assets', `${z.uuid().parse(id)}.png`));
  }
  async asset(id: string): Promise<Asset> {
    const stmt = this.db.prepare('SELECT name, width, height FROM assets WHERE id = ?');
    try {
      stmt.bind([z.uuid().parse(id)]);
      if (!stmt.step())
        throw new Error('An image is missing from local storage. Reimport the image.');
      const row = stmt.getAsObject();
      return {
        id,
        name: String(row.name),
        width: Number(row.width),
        height: Number(row.height),
        dataUrl: `data:image/png;base64,${(await this.bytes(id)).toString('base64')}`,
      };
    } finally {
      stmt.free();
    }
  }
}
