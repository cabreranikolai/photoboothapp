import { _electron as electron } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import assert from 'node:assert/strict';
const root = path.resolve('artifacts/desktop-smoke');
await mkdir(root, { recursive: true });
const data = path.join(root, `userdata-${Date.now()}`);
const frame = path.join(root, 'frame.png');
const photos = [];
for (const [i, background] of ['#aa5030', '#3d745e', '#567893', '#c89e56'].entries()) {
  const photo = path.join(root, `sample-${i}.png`);
  await sharp({ create: { width: 800, height: 600, channels: 4, background } })
    .png()
    .toFile(photo);
  photos.push(photo);
}
await sharp(
  Buffer.from(
    '<svg width="1200" height="1800"><rect x="10" y="10" width="1180" height="1780" rx="12" fill="none" stroke="#294b36" stroke-width="20"/></svg>',
  ),
)
  .png()
  .toFile(frame);
const env = { ...process.env, LUMA_TEST_DATA: data };
delete env.ELECTRON_RUN_AS_NODE;
let server;
if (process.argv.includes('--dev')) {
  const { createServer } = await import('vite');
  server = await createServer();
  await server.listen();
  env.LUMA_DEV = '1';
}
const app = await electron.launch({
  args: ['.'],
  env,
});
try {
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBoxSync = () => 1;
  });
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.getByRole('heading', { name: 'Frame Designer', exact: true }).waitFor();
  const choose = async (label, files) => {
    const waiting = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: label, exact: true }).click();
    await (await waiting).setFiles(files);
  };
  // Upload overlay using the hidden input (default upload kind).
  await page.locator('input[type=file]').setInputFiles(frame);
  await page.getByText('Frame imported. Add and position photo slots manually.').waitFor();
  await page.getByRole('button', { name: 'Dismiss notification' }).click();
  await choose('Load sample photos', photos);
  await page.getByText('4 sample photos assigned in capture order.').waitFor();
  await page.getByRole('button', { name: 'Save template', exact: true }).click();
  await page.getByText('Template saved locally. Every layer remains editable.').waitFor();
  const template = await page.evaluate(async () => {
    const [t] = await window.studio.listTemplates();
    return t;
  });
  assert.equal(template.layers.filter((l) => l.type === 'photo').length, 4);
  assert.equal(
    new Set(template.layers.filter((l) => l.type === 'photo').map((l) => l.assetId)).size,
    4,
  );
  assert.equal(template.layers.at(-1).type, 'image');
  const output = path.join(root, 'composition.png'),
    bundle = path.join(root, 'template.luma.json');
  await app.evaluate(({ dialog }, output) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: output });
  }, output);
  await page.getByRole('button', { name: 'Export print PNG', exact: true }).click();
  await page.getByText(`Print-ready composition saved: ${output}`, { exact: true }).waitFor();
  const meta = await sharp(output).metadata();
  assert.equal(meta.width, 1200);
  assert.equal(meta.height, 1800);
  assert.equal(meta.density, 300);
  await app.evaluate(({ dialog }, bundle) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: bundle });
  }, bundle);
  assert.equal(await page.evaluate((t) => window.studio.exportTemplate(t), template), true);
  await app.evaluate(({ dialog }, bundle) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [bundle] });
  }, bundle);
  const imported = await page.evaluate(() => window.studio.importTemplate());
  assert.notEqual(imported.id, template.id);
  assert.notEqual(imported.layers[0].assetId, template.layers[0].assetId);
  assert.equal(imported.layers[0].x, template.layers[0].x);
  await page.reload();
  await page.getByRole('button', { name: 'Frame Library', exact: true }).click();
  await page.getByRole('heading', { name: 'Frame Library', exact: true }).waitFor();
  await page.locator('.template-cover').first().click();
  await page.getByRole('heading', { name: 'Frame Designer', exact: true }).waitFor();
  await page.screenshot({ path: path.join(root, 'designer.png'), fullPage: true });
  await page
    .getByRole('button', { name: 'Photo placeholder Assign a captured photo', exact: false })
    .click();
  await page.getByLabel('X position', { exact: true }).fill('125');
  await page.getByRole('button', { name: 'Save template', exact: true }).click();
  await page.getByText('Template saved locally. Every layer remains editable.').waitFor();
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
  assert.deepEqual(errors, []);
  console.log(
    'Desktop workflow passed: PNG import, samples, SQLite save/load, portable template roundtrip, exact 300 DPI export, numeric slot editing, isolated renderer.',
  );
} finally {
  await app.close();
  await server?.close();
}
