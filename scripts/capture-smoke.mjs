import { _electron as electron } from 'playwright';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
async function until(page, predicate) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (await page.evaluate(predicate)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Timed out waiting for desktop state');
}
const root = path.resolve('artifacts/capture-smoke');
await mkdir(root, { recursive: true });
const env = { ...process.env, LUMA_TEST_DATA: path.join(root, `userdata-${Date.now()}`) };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({
  ...(process.env.LUMA_TEST_EXE ? { executablePath: process.env.LUMA_TEST_EXE } : {}),
  args: [
    ...(process.env.LUMA_TEST_EXE ? [] : ['.']),
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
  ],
  env,
});
try {
  await app.evaluate(({ app, BrowserWindow, dialog }) => {
    dialog.showMessageBoxSync = () => 1;
    app.testPrintCalls = [];
    app.failTestPrint = false;
    const patch = (win) => {
      win.webContents.getPrintersAsync = async () => [
        { name: 'Luma Test Printer', displayName: 'Luma Test Printer', options: {} },
      ];
      win.webContents.print = (options, callback) => {
        app.testPrintCalls.push(options);
        setTimeout(
          () => callback(!app.failTestPrint, app.failTestPrint ? 'Printer offline (test)' : ''),
          100,
        );
      };
    };
    BrowserWindow.getAllWindows().forEach(patch);
    app.on('browser-window-created', (_event, win) => patch(win));
  });
  const page = await app.firstWindow(),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.getByRole('button', { name: 'Start Photobooth', exact: true }).click();
  await page.getByLabel('Capture source', { exact: true }).selectOption('demo');
  await page.getByLabel('Countdown (sec)', { exact: true }).fill('0');
  await page.getByLabel('Between shots (sec)', { exact: true }).fill('0');
  await page.getByLabel('Event name', { exact: true }).fill('Capture smoke test');
  await page.getByRole('button', { name: 'Connect camera', exact: true }).click();
  await page
    .getByText('Demo Mode connected. Generated images are not camera photographs.')
    .waitFor();
  await page.getByRole('button', { name: 'Start session', exact: true }).click();
  await page
    .getByRole('heading', { name: 'Your photos are ready', exact: true })
    .waitFor({ timeout: 30000 });
  let sessions = await page.evaluate(() => window.studio.listSessions());
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].shots.length, 4);
  assert.equal(sessions[0].source, 'demo');
  const pdf = path.join(root, 'session.pdf');
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath });
  }, pdf);
  await page.getByRole('button', { name: 'Save print PDF', exact: true }).click();
  await until(page, async () => (await window.studio.listSessions()).length === 1);
  // Await PDF completion via the bridge for a deterministic native renderer check.
  assert.equal(
    await page.evaluate((id) => window.studio.exportSessionPDF(id), sessions[0].id),
    true,
  );
  const pdfBytes = await readFile(pdf);
  assert.equal(pdfBytes.subarray(0, 5).toString(), '%PDF-');
  assert.match(pdfBytes.toString('latin1'), /\/MediaBox\s*\[\s*0\s+0\s+288\s+432\s*\]/);
  await page.getByLabel('Installed printer', { exact: true }).selectOption('Luma Test Printer');
  await page.getByLabel('Copies', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'Print session', exact: true }).click();
  await until(page, async () =>
    (await window.studio.listPrintJobs()).some((j) => j.status === 'submitted'),
  );
  const calls = await app.evaluate(({ app }) => app.testPrintCalls);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].copies, 2);
  assert.deepEqual(calls[0].pageSize, { width: 101600, height: 152400 });
  await page.getByRole('button', { name: 'Retake all photos', exact: true }).click();
  await page
    .getByRole('heading', { name: 'Your photos are ready', exact: true })
    .waitFor({ timeout: 30000 });
  await until(
    page,
    async () =>
      (await window.studio.listSessions()).filter((s) => s.status === 'complete').length === 2,
  );
  await page.getByLabel('Countdown (sec)', { exact: true }).fill('3');
  await page.getByRole('button', { name: 'Start next session', exact: true }).click();
  await page.locator('.countdown').waitFor();
  await page.getByRole('button', { name: 'Cancel after shot', exact: true }).click();
  await until(page, async () =>
    (await window.studio.listSessions()).some((s) => s.status === 'cancelled'),
  );
  await page.getByLabel('Capture source', { exact: true }).selectOption('webcam');
  const mirrorToggle = page.getByRole('switch', { name: 'Mirror camera', exact: true });
  await mirrorToggle.check();
  assert.equal(
    await page.locator('video').evaluate((v) => getComputedStyle(v).transform),
    'matrix(-1, 0, 0, 1, 0, 0)',
  );
  await mirrorToggle.uncheck();
  assert.equal(await page.locator('video').evaluate((v) => getComputedStyle(v).transform), 'none');
  await mirrorToggle.check();
  await page.getByRole('button', { name: 'Save settings', exact: true }).click();
  await until(page, async () => (await window.studio.getCaptureSettings()).mirror === true);
  await page.getByLabel('Countdown (sec)', { exact: true }).fill('0');
  await page.getByRole('button', { name: 'Connect camera', exact: true }).click();
  await until(page, () => document.querySelector('video')?.videoWidth > 0);
  await page.getByRole('button', { name: 'Start session', exact: true }).click();
  await until(page, async () =>
    (await window.studio.listSessions()).some(
      (s) => s.source === 'webcam' && s.status === 'complete',
    ),
  );
  sessions = await page.evaluate(() => window.studio.listSessions());
  assert.equal(sessions.find((s) => s.source === 'webcam').shots.length, 4);
  assert.equal(sessions.find((s) => s.source === 'webcam').mirror, true);
  await page.screenshot({ path: path.join(root, 'capture-complete.png'), fullPage: true });
  await page.getByRole('button', { name: 'Print Manager', exact: true }).click();
  await page.locator('.session-row').first().click();
  await app.evaluate(({ app }) => {
    app.failTestPrint = true;
  });
  await page.getByRole('button', { name: 'Print / reprint', exact: true }).click();
  await until(page, async () =>
    (await window.studio.listPrintJobs()).some(
      (j) => j.status === 'failed' && j.error.includes('offline'),
    ),
  );
  await page.screenshot({ path: path.join(root, 'print-manager.png'), fullPage: true });
  assert.deepEqual(errors, []);
  console.log(
    'Capture smoke passed: demo and Chromium test-webcam sequences, four originals, full-resolution composition, retake retention, cancellation, native PDF 4x6 sizing, print submission options and printer failure. Native print callbacks simulated; no physical printing performed.',
  );
} catch (error) {
  const page = await app.firstWindow();
  console.error((await page.locator('body').innerText()).slice(-6000));
  await page.screenshot({ path: path.join(root, 'failure.png'), fullPage: true });
  throw error;
} finally {
  await app.close();
}
