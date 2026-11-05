import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { unzipSync } from 'fflate';
import { PDFDocument } from '@cantoo/pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { FIXTURES, textPdf } from './pdf-fixtures';

/**
 * Organize tools end to end: Rotate, Delete pages, Rearrange, the editor's undo / reset / confirmations,
 * Split by ranges / every N / one per page, the hub, SEO, errors, phone widths, keyboard use.
 * Every download is opened again and its page count, order and rotation are checked.
 * Samples are made fresh by textPdf(): page n of a file says "<Label> page n of <total>".
 */
const SHOTS = 'test-results/screenshots';
let six: string;
let locked: string;
let notPdf: string;
let many: string;
let huge: string;

test.beforeAll(async () => {
  mkdirSync(FIXTURES, { recursive: true });
  const put = (name: string, data: Buffer | Uint8Array) => {
    const path = join(FIXTURES, name);
    writeFileSync(path, data);
    return path;
  };
  six = put('six.pdf', await textPdf('Six', 6));
  many = put('three-hundred-and-one.pdf', await textPdf('Many', 301));
  const lockedDoc = await PDFDocument.create();
  lockedDoc.addPage([595, 842]);
  lockedDoc.encrypt({ userPassword: 'secret', ownerPassword: 'owner' });
  locked = put('locked-organize.pdf', await lockedDoc.save());
  notPdf = put('notes-organize.pdf', Buffer.from('These are plain notes, not a PDF.\n'.repeat(20)));
  huge = put('huge-organize.pdf', Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(11 * 1024 * 1024, 0x20)]));
});

const dropInput = (page: Page) => page.locator('input[type="file"]').first();
const alerts = (page: Page) => page.getByRole('alert').filter({ hasText: /\S/ });
/** Pick a radio the way a person does: by clicking its label (the radio itself is visually hidden). */
const pick = (page: Page, name: string | RegExp) => page.locator('label').filter({ has: page.getByRole('radio', { name }) }).click();

async function download(page: Page, name: string | RegExp) {
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name }).click()]);
  return { name: file.suggestedFilename(), bytes: await readFile(await file.path()) };
}

/** The "N" of each page's "<Label> page N of M" line, in page order, read by pdf.js (independent of our engine). */
async function pageNumbers(bytes: Buffer): Promise<string[]> {
  const doc = await getDocument({ data: new Uint8Array(bytes), disableFontFace: true }).promise;
  const out: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    const text = content.items.map((it) => ('str' in it ? it.str : '')).join(' ');
    out.push(text.match(/page (\d+) of \d+/)?.[1] ?? '?');
  }
  await doc.loadingTask.destroy();
  return out;
}
const rotations = async (bytes: Buffer) => (await PDFDocument.load(bytes)).getPages().map((p) => p.getRotation().angle);

/** Collects uncaught errors, console errors and anything sent out of the page (a PDF must never be). */
function watch(page: Page) {
  const problems: string[] = [];
  const sent: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`));
  page.on('request', (r) => ['POST', 'PUT', 'PATCH'].includes(r.method()) && sent.push(`${r.method()} ${r.url()}`));
  return { problems, sent };
}

const tick = (page: Page, n: number) => page.getByRole('checkbox', { name: new RegExp(`^Tick page ${n}(,|$)`) });
const editorSave = (page: Page) => page.getByTestId('editor-save');

async function openEditor(page: Page, path: string, file = six) {
  await page.goto(path);
  await dropInput(page).setInputFiles(file);
  await expect(page.getByTestId('page-editor')).toBeVisible({ timeout: 30_000 });
}

test('rotate: turn two ticked pages and one single page; undo works; the saved file has the right turns and order', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const w = watch(page);
  await openEditor(page, '/rotate-pdf');
  await expect(editorSave(page)).toBeDisabled();
  await expect(page.getByTestId('edit-summary')).toHaveText('No changes yet.');

  await tick(page, 2).check();
  await tick(page, 4).check();
  await expect(page.getByTestId('selected-count')).toHaveText('2 of 6 ticked');
  await page.getByRole('button', { name: 'Rotate 2 selected right' }).click();
  await page.getByRole('button', { name: 'Rotate page 1 left' }).click();
  await expect(page.getByTestId('edit-summary')).toHaveText('3 pages turned');

  // Undo steps back one change; doing it again puts it back.
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByTestId('edit-summary')).toHaveText('2 pages turned');
  await page.getByRole('button', { name: 'Rotate page 1 left' }).click();
  await page.waitForTimeout(1500); // let the thumbnails draw for the screenshot
  await page.screenshot({ path: `${SHOTS}/pdf-rotate-desktop.png`, fullPage: true });

  await expect(editorSave(page)).toHaveText('Save PDF (6 pages)');
  await editorSave(page).click();
  await expect(page.getByText('Done. Your PDF is ready.')).toBeVisible({ timeout: 60_000 });
  const out = await download(page, 'Download PDF');
  expect(out.name).toBe('six-edited.pdf');
  expect(await rotations(out.bytes)).toEqual([270, 90, 0, 90, 0, 0]);
  expect(await pageNumbers(out.bytes)).toEqual(['1', '2', '3', '4', '5', '6']);
  expect(w.sent, 'nothing is uploaded').toEqual([]);
  expect(w.problems).toEqual([]);
});

test('rotate with nothing ticked turns every page', async ({ page }) => {
  await openEditor(page, '/rotate-pdf');
  await page.getByRole('button', { name: 'Rotate all 6 pages right' }).click();
  await page.getByRole('button', { name: 'Rotate all 6 pages right' }).click();
  await editorSave(page).click();
  await expect(page.getByText('Done. Your PDF is ready.')).toBeVisible({ timeout: 60_000 });
  const out = await download(page, 'Download PDF');
  expect(await rotations(out.bytes)).toEqual([180, 180, 180, 180, 180, 180]);
});

test('delete: confirm before deleting, cancel keeps the pages, undo and reset work, the saved file lacks the deleted pages', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const w = watch(page);
  await openEditor(page, '/delete-pdf-pages');
  await tick(page, 3).check();
  await tick(page, 5).check();

  await page.getByRole('button', { name: 'Delete 2 pages' }).click();
  await expect(page.getByTestId('editor-confirm')).toContainText('Delete 2 pages?');
  await page.getByTestId('editor-confirm').getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByTestId('editor-confirm')).toHaveCount(0);
  await expect(tick(page, 6)).toBeVisible(); // still six pages

  await page.getByRole('button', { name: 'Delete 2 pages' }).click();
  await page.getByTestId('editor-confirm-yes').click();
  await expect(page.getByTestId('edit-summary')).toHaveText('2 pages removed');
  await expect(tick(page, 4)).toBeVisible();
  await expect(tick(page, 5)).toHaveCount(0); // four pages are left

  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByTestId('edit-summary')).toHaveText('No changes yet.');

  // Delete 3 and 5 again, then page 1 with its own button; the saved file keeps original pages 2, 4 and 6.
  await tick(page, 3).check();
  await tick(page, 5).check();
  await page.getByRole('button', { name: 'Delete 2 pages' }).click();
  await page.getByTestId('editor-confirm-yes').click();
  await page.getByRole('button', { name: 'Delete page 1' }).click();
  await page.getByTestId('editor-confirm-yes').click();
  await expect(page.getByTestId('edit-summary')).toHaveText('3 pages removed');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOTS}/pdf-delete-desktop.png`, fullPage: true });

  await editorSave(page).click();
  await expect(page.getByText('Done. Your PDF is ready.')).toBeVisible({ timeout: 60_000 });
  const out = await download(page, 'Download PDF');
  expect(await pageNumbers(out.bytes)).toEqual(['2', '4', '6']);

  // Reset goes back to six pages after a confirmation.
  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(page.getByTestId('editor-confirm')).toContainText('Go back to the original pages?');
  await page.getByTestId('editor-confirm-yes').click();
  await expect(page.getByTestId('edit-summary')).toHaveText('No changes yet.');
  await expect(tick(page, 6)).toBeVisible();
  expect(w.sent).toEqual([]);
  expect(w.problems).toEqual([]);
});

test('delete: the last page can’t be deleted; “keep only ticked” asks first and keeps just those', async ({ page }) => {
  await openEditor(page, '/delete-pdf-pages');
  await page.getByRole('button', { name: 'Select all' }).click();
  await expect(page.getByRole('button', { name: /^Delete ticked pages$/ })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Keep only ticked' })).toBeDisabled();
  await page.getByRole('button', { name: 'Clear selection' }).click();

  await tick(page, 2).check();
  await tick(page, 5).check();
  await page.getByRole('button', { name: 'Keep only ticked' }).click();
  await expect(page.getByTestId('editor-confirm')).toContainText('Keep only the 2 pages you ticked and remove the other 4?');
  await page.getByTestId('editor-confirm-yes').click();
  await expect(page.getByTestId('edit-summary')).toHaveText('4 pages removed');
  await editorSave(page).click();
  await expect(page.getByText('Done. Your PDF is ready.')).toBeVisible({ timeout: 60_000 });
  const out = await download(page, 'Download PDF');
  expect(await pageNumbers(out.bytes)).toEqual(['2', '5']);
});

test('rearrange: arrow buttons keep keyboard focus, drag and drop works, the saved order is right', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const w = watch(page);
  await openEditor(page, '/rearrange-pdf-pages');

  // Keyboard: move page 1 later with Enter; focus stays on that page's button.
  const later = page.getByRole('button', { name: 'Move page 1 later' });
  await later.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-page="0"] [data-control="later"]')).toBeFocused();
  await expect(page.getByText('Page 2 (was 1)').first()).toBeVisible();
  await expect(page.getByTestId('edit-summary')).toContainText('order changed');
  // Page 3 earlier: order is now 2, 3, 1, 4, 5, 6.
  await page.getByRole('button', { name: 'Move page 3 earlier' }).click();

  // Drag the last page onto the first.
  await page.locator('[data-page="5"]').dragTo(page.locator('[data-page="1"]'));
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOTS}/pdf-rearrange-desktop.png`, fullPage: true });

  await editorSave(page).click();
  await expect(page.getByText('Done. Your PDF is ready.')).toBeVisible({ timeout: 60_000 });
  const out = await download(page, 'Download PDF');
  expect(await pageNumbers(out.bytes)).toEqual(['6', '2', '3', '1', '4', '5']);
  expect(w.sent).toEqual([]);
  expect(w.problems).toEqual([]);
});

test('editor: leaving with unsaved changes asks first; switching between Rotate, Delete and Rearrange keeps them', async ({ page }) => {
  await openEditor(page, '/rotate-pdf');
  await page.getByRole('button', { name: 'Rotate page 2 right' }).click();
  await expect(page.getByTestId('edit-summary')).toHaveText('1 page turned');

  // Same editor, same changes, other tool in the same group.
  await pick(page, /Delete pages/);
  await expect(page).toHaveURL(/\/delete-pdf-pages$/);
  await expect(page.getByTestId('edit-summary')).toHaveText('1 page turned');

  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('button', { name: 'Start again' }).click();
  await expect(page.getByTestId('page-editor')).toBeVisible();

  page.once('dialog', (d) => {
    expect(d.message()).toContain('Discard your page changes?');
    void d.accept();
  });
  await page.getByRole('button', { name: 'Start again' }).click();
  await expect(page.getByTestId('page-editor')).toHaveCount(0);
  await expect(dropInput(page)).toBeAttached();
});

test('split: ranges and ticks stay in step, bad ranges get a plain message, the saved file has exactly those pages', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const w = watch(page);
  await page.goto('/split-pdf');
  await dropInput(page).setInputFiles(six);
  const box = page.locator('#split-ranges');
  await box.fill('2-4, 6');
  for (const n of [2, 3, 4, 6]) await expect(page.getByRole('checkbox', { name: `Page ${n}`, exact: true })).toBeChecked();
  for (const n of [1, 5]) await expect(page.getByRole('checkbox', { name: `Page ${n}`, exact: true })).not.toBeChecked();
  await expect(box).toHaveValue('2-4, 6'); // typing never rewrites itself

  await page.getByRole('checkbox', { name: 'Page 5', exact: true }).check();
  await expect(box).toHaveValue('2-6'); // ticking rewrites it the short way

  await box.fill('9');
  await expect(alerts(page)).toContainText('This PDF has 6 pages, so page 9 isn’t there.');
  await expect(page.getByRole('checkbox', { name: 'Page 5', exact: true })).toBeChecked(); // a bad range changes nothing
  await box.fill('abc');
  await expect(alerts(page)).toContainText('isn’t a page or a range');
  await box.fill('5-2');
  await expect(alerts(page)).toContainText('runs backwards');

  await page.getByRole('button', { name: 'Odd pages' }).click();
  await expect(box).toHaveValue('1, 3, 5');
  await page.getByRole('button', { name: 'Even pages' }).click();
  await expect(box).toHaveValue('2, 4, 6');
  await box.fill('2-4, 6');
  await page.getByRole('button', { name: 'Extract 4 pages' }).click();
  await expect(page.getByText('Done. Your PDF is ready.')).toBeVisible({ timeout: 60_000 });
  const out = await download(page, 'Download PDF');
  expect(out.name).toBe('six-pages.pdf');
  expect(await pageNumbers(out.bytes)).toEqual(['2', '3', '4', '6']);
  expect(w.sent).toEqual([]);
  expect(w.problems).toEqual([]);
});

test('split: every N pages and one PDF per page come as a ZIP of real PDFs', async ({ page }) => {
  await page.goto('/split-pdf');
  await dropInput(page).setInputFiles(six);
  await pick(page, 'Every N pages');
  await page.getByLabel('Pages in each file').fill('4');
  await expect(page.getByText('6 pages in groups of 4 makes 2 files')).toBeVisible();
  await page.getByRole('button', { name: 'Split into 2 PDFs' }).click();
  await expect(page.getByText('Done. 2 PDFs are ready.')).toBeVisible({ timeout: 60_000 });
  let zip = unzipSync(new Uint8Array((await download(page, 'Download all (ZIP)')).bytes));
  expect(Object.keys(zip).sort()).toEqual(['six-part-1.pdf', 'six-part-2.pdf']);
  expect(await pageNumbers(Buffer.from(zip['six-part-1.pdf']))).toEqual(['1', '2', '3', '4']);
  expect(await pageNumbers(Buffer.from(zip['six-part-2.pdf']))).toEqual(['5', '6']);

  await page.getByRole('button', { name: 'Split another' }).click();
  await dropInput(page).setInputFiles(six);
  await pick(page, 'One PDF per page');
  await page.getByRole('button', { name: 'Split into 6 PDFs' }).click();
  await expect(page.getByText('Done. 6 PDFs are ready.')).toBeVisible({ timeout: 60_000 });
  zip = unzipSync(new Uint8Array((await download(page, 'Download all (ZIP)')).bytes));
  expect(Object.keys(zip).sort()).toEqual([1, 2, 3, 4, 5, 6].map((n) => `six-page-${n}.pdf`));
  expect(await pageNumbers(Buffer.from(zip['six-page-4.pdf']))).toEqual(['4']);
});

test('split: “every N” refuses a number that makes no sense', async ({ page }) => {
  await page.goto('/split-pdf');
  await dropInput(page).setInputFiles(six);
  await pick(page, 'Every N pages');
  const n = page.getByLabel('Pages in each file');
  await n.fill('0');
  await expect(page.getByText('Type a number from 1 to 6.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enter a number first' })).toBeDisabled();
  await n.fill('6');
  await expect(page.getByRole('button', { name: 'That’s one file already' })).toBeDisabled();
});

for (const path of ['/rotate-pdf', '/delete-pdf-pages', '/rearrange-pdf-pages']) {
  test(`${path}: password, not a PDF, over 10 MB and over 300 pages are each refused calmly`, async ({ page }) => {
    await page.goto(path);
    await dropInput(page).setInputFiles(locked);
    await expect(alerts(page)).toContainText('This PDF has a password.');
    await dropInput(page).setInputFiles(notPdf);
    await expect(alerts(page)).toContainText("That doesn't look like a PDF.");
    await dropInput(page).setInputFiles(huge);
    await expect(alerts(page)).toContainText('This PDF is over 10 MB.');
    await expect(page.getByTestId('page-editor')).toHaveCount(0);
    await dropInput(page).setInputFiles(many);
    await expect(page.getByText('This PDF has 301 pages.')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('page-editor')).toHaveCount(0);
  });
}

// The hub's structure, links and look are covered in pdf-hub.spec.ts; this keeps the click-through from the directory.
test('a card in the hub directory opens its tool', async ({ page }) => {
  await page.goto('/pdf-tools');
  await page.locator('#pdf-directory').getByRole('link', { name: /^Rotate PDF/ }).click();
  await expect(page).toHaveURL(/\/rotate-pdf$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Rotate a PDF');
});

test('the sitemap lists the new pages', async ({ request }) => {
  const xml = await (await request.get('/sitemap.xml')).text();
  for (const p of ['/rotate-pdf', '/delete-pdf-pages', '/rearrange-pdf-pages', '/add-page-numbers-to-pdf', '/pdf-to-png', '/pdf-to-text', '/watermark-pdf', '/protect-pdf']) expect(xml).toContain(p);
});

for (const [path, h1] of [
  ['/rotate-pdf', 'Rotate a PDF'],
  ['/delete-pdf-pages', 'Delete pages from a PDF'],
  ['/rearrange-pdf-pages', 'Rearrange PDF pages'],
  ['/split-pdf', 'Split a PDF'],
  ['/add-page-numbers-to-pdf', 'Add page numbers to a PDF'],
  ['/pdf-to-png', 'PDF to PNG'],
  ['/pdf-to-text', 'PDF to Text'],
  ['/watermark-pdf', 'Watermark a PDF'],
  ['/protect-pdf', 'Protect a PDF with a password'],
  ['/pdf-tools', 'PDF tools, right in your browser'],
] as const) {
  test(`${path}: title, description, canonical, H1, FAQ and breadcrumb data, related tools`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(h1);
    expect((await page.title()).length).toBeGreaterThan(15);
    expect(((await page.locator('meta[name="description"]').getAttribute('content')) ?? '').length).toBeGreaterThan(60);
    expect(await page.locator('link[rel="canonical"]').getAttribute('href')).toBe(`https://kaamsolv.com${path}`);
    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    const types = blocks.flatMap((b) => {
      const j = JSON.parse(b) as { '@graph'?: { '@type': string }[]; '@type'?: string };
      return (j['@graph'] ?? [j]).map((n) => n['@type']);
    });
    expect(types).toEqual(expect.arrayContaining(['WebApplication', 'BreadcrumbList', 'FAQPage']));
    await expect(page.getByRole('heading', { name: /related/i })).toBeVisible();
  });
}

for (const scheme of ['light', 'dark'] as const) {
  for (const width of [360, 320]) {
    test(`phone ${width} px ${scheme}: editor, confirm bar and hub fit; touch targets are 44 px`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width, height: 800 });
      const w = watch(page);
      const noSideways = async (label: string) =>
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `no horizontal scroll: ${label}`).toBe(true);

      await openEditor(page, '/rotate-pdf');
      await noSideways('editor');
      await tick(page, 2).check();
      await tick(page, 3).check();
      await page.getByRole('button', { name: 'Delete 2 pages' }).click();
      await expect(page.getByTestId('editor-confirm')).toBeVisible();
      await noSideways('confirm bar');
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `${SHOTS}/pdf-editor-${width}-${scheme}.png`, fullPage: true });
      for (const name of ['Rotate page 1 left', 'Rotate page 1 right', 'Delete page 1', 'Move page 1 later']) {
        const box = await page.getByRole('button', { name }).boundingBox();
        expect(box!.width, name).toBeGreaterThanOrEqual(43.5);
        expect(box!.height, name).toBeGreaterThanOrEqual(43.5);
      }

      await page.goto('/split-pdf');
      await dropInput(page).setInputFiles(six);
      await expect(page.getByRole('checkbox', { name: 'Page 6', exact: true })).toBeVisible({ timeout: 30_000 });
      await pick(page, 'Every N pages');
      await noSideways('split every N');
      await page.screenshot({ path: `${SHOTS}/pdf-split-modes-${width}-${scheme}.png`, fullPage: true });

      await page.goto('/pdf-tools');
      await page.waitForLoadState('networkidle');
      await noSideways('hub');
      await page.screenshot({ path: `${SHOTS}/pdf-hub-${width}-${scheme}.png`, fullPage: true });
      expect(w.problems).toEqual([]);
    });
  }
}
