import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FIXTURES, textPdf } from './pdf-fixtures';

/**
 * The redesigned /pdf-tools: hero with the real upload workspace, popular tasks, the grouped directory,
 * privacy and limits. Checks what the page promises (every card is a real, working page; planned tools
 * are plain text), that upload still works and widens the layout, and that nothing overflows or hides
 * its focus ring at five widths in both themes. Screenshots go to test-results/screenshots for a human look.
 */
const SHOTS = 'test-results/screenshots';
let six: string;

test.beforeAll(async () => {
  mkdirSync(FIXTURES, { recursive: true });
  six = join(FIXTURES, 'six.pdf');
  writeFileSync(six, await textPdf('Six', 6));
});

const directory = (page: Page) => page.locator('#pdf-directory');
const SECTIONS = ['Organise PDF', 'Compress & Optimise', 'Convert PDF', 'Secure & Enhance', 'Scan & Extract'];
const LIVE: Record<string, [string, string]> = {
  'Merge PDF': ['/merge-pdf', 'Organise PDF'],
  'Split PDF': ['/split-pdf', 'Organise PDF'],
  'Rotate PDF': ['/rotate-pdf', 'Organise PDF'],
  'Delete pages': ['/delete-pdf-pages', 'Organise PDF'],
  'Rearrange pages': ['/rearrange-pdf-pages', 'Organise PDF'],
  'Compress PDF': ['/compress-pdf', 'Compress & Optimise'],
  'PDF to JPG': ['/pdf-to-jpg', 'Convert PDF'],
  'PDF to PNG': ['/pdf-to-png', 'Convert PDF'],
  'JPG to PDF': ['/jpg-to-pdf', 'Convert PDF'],
  'PDF to Word': ['/pdf-to-word', 'Convert PDF'],
  'PDF to Text': ['/pdf-to-text', 'Convert PDF'],
  'Protect PDF': ['/protect-pdf', 'Secure & Enhance'],
  'Watermark PDF': ['/watermark-pdf', 'Secure & Enhance'],
  'Page numbers': ['/add-page-numbers-to-pdf', 'Secure & Enhance'],
};

test('the page reads in order: hero, popular tasks, the directory, then trust, how it works and questions', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/pdf-tools');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('PDF tools, right in your browser');
  const headings = await page.getByRole('heading', { level: 2 }).allTextContents();
  expect(headings.filter((h) => !/Privacy and limits/.test(h)).slice(0, 6)).toEqual(['Popular PDF tasks', 'All PDF tools', 'Saved you some kaam? Pass it on.', 'How it works', 'Questions', 'Related tools']);
  const sections = await directory(page).getByRole('heading', { level: 3 }).allTextContents();
  expect(sections).toEqual(SECTIONS);
  await expect(page.getByText('Files stay on your device')).toBeVisible();
  await expect(page.getByText('Free, no sign-up', { exact: true })).toBeVisible();
  await expect(page.getByText('Up to 10 MB a file')).toBeVisible();
  await expect(page.getByText('Nothing leaves your device')).toBeVisible();
  await expect(page.getByText('Your original stays as it is')).toBeVisible();
  await expect(page.getByText('Plain limits')).toBeVisible();
  // Upload is optional: a visible way straight to the tools.
  await page.getByRole('link', { name: 'Browse all tools' }).click();
  await expect(page).toHaveURL(/#pdf-directory$/);
  await expect(directory(page)).toBeInViewport();
});

test('popular tasks are Merge, Split and Compress, as real links to live pages', async ({ page, request }) => {
  await page.goto('/pdf-tools');
  const row = page.locator('section[aria-labelledby="popular-pdf"]');
  const cards = row.getByRole('link');
  await expect(cards).toHaveCount(3);
  const found = await cards.evaluateAll((els) => els.map((e) => [e.textContent?.trim() ?? '', e.getAttribute('href')]));
  expect(found.map(([, href]) => href)).toEqual(['/merge-pdf', '/split-pdf', '/compress-pdf']);
  expect(found[0][0]).toContain('Merge PDF');
  for (const [, href] of found) expect((await request.get(href!)).status(), href!).toBe(200);
});

test('the directory: every live tool is a link in its group to a page that opens; planned tools are plain text', async ({ page, request }) => {
  await page.goto('/pdf-tools');
  const dir = directory(page);
  for (const [name, [href, group]] of Object.entries(LIVE)) {
    const section = dir.locator('section').filter({ has: page.getByRole('heading', { level: 3, name: group, exact: true }) });
    const card = section.getByRole('link', { name: new RegExp(`^${name}`) });
    await expect(card, `${name} in ${group}`).toHaveAttribute('href', href);
    expect((await request.get(href)).status(), `${href} opens`).toBe(200);
  }
  expect(await dir.getByRole('link').count()).toBe(Object.keys(LIVE).length);
  const scan = dir.locator('section').filter({ has: page.getByRole('heading', { level: 3, name: 'Scan & Extract', exact: true }) });
  for (const name of ['OCR PDF', 'Extract tables', 'Compare PDFs']) {
    await expect(scan.getByText(name, { exact: true })).toBeVisible();
    await expect(scan.getByRole('link', { name: new RegExp(name) })).toHaveCount(0);
  }
  await expect(dir.getByText('Coming soon', { exact: true })).toHaveCount(3);
  await expect(dir.getByText('5 tools')).toHaveCount(2);
  await expect(dir.getByText('1 tool', { exact: true })).toHaveCount(1);
  await expect(dir.getByText('3 tools')).toHaveCount(1);
  await expect(dir.getByText('Works best on scans and photo-heavy PDFs.')).toBeVisible();
});

test('upload still works from the hero: a PDF loads, the picker appears and the layout gives the tool the full width', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const problems: string[] = [];
  const sent: string[] = [];
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('console', (m) => m.type() === 'error' && problems.push(m.text()));
  page.on('request', (r) => ['POST', 'PUT', 'PATCH'].includes(r.method()) && sent.push(r.url()));
  await page.goto('/pdf-tools');
  const card = page.locator('[data-pdf-active]').locator('..');
  const before = (await card.boundingBox())!;
  expect(before.width, 'beside the headline, not full width').toBeLessThan(700);

  await page.locator('input[type="file"]').first().setInputFiles(six);
  await expect(page.getByRole('radio', { name: 'Compress', exact: true })).toBeChecked({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Compress PDF' })).toBeVisible();
  const after = (await card.boundingBox())!;
  expect(after.width, 'a loaded file gets the full width').toBeGreaterThan(1000);
  await page.getByRole('radio', { name: 'Organise', exact: true }).evaluate((el) => (el as HTMLInputElement).click()).catch(() => {});
  expect(sent, 'nothing is uploaded').toEqual([]);
  expect(problems).toEqual([]);
});

test('cards have a visible keyboard focus ring and a comfortable tap size', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('/pdf-tools');
  const first = directory(page).getByRole('link').first();
  await first.focus();
  const ring = await first.evaluate((el) => getComputedStyle(el).boxShadow);
  expect(ring, 'a focus ring').not.toBe('none');
  const boxes = await directory(page).locator('ul a').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  expect(Math.min(...boxes), 'every card is at least a finger tall').toBeGreaterThanOrEqual(72);
  const popular = await page.locator('section[aria-labelledby="popular-pdf"]').getByRole('link').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  expect(Math.min(...popular)).toBeGreaterThanOrEqual(88);
});

const WIDTHS = [1440, 1280, 768, 375, 320];
for (const scheme of ['light', 'dark'] as const) {
  for (const width of WIDTHS) {
    test(`${width}px ${scheme}: nothing runs off the side, every card is fully on screen; screenshots`, async ({ page }) => {
      mkdirSync(SHOTS, { recursive: true });
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await page.setViewportSize({ width, height: width >= 1024 ? 900 : 812 });
      const problems: string[] = [];
      page.on('pageerror', (e) => problems.push(e.message));
      page.on('console', (m) => m.type() === 'error' && problems.push(m.text()));
      await page.goto('/pdf-tools');
      await expect(page.getByRole('heading', { level: 3, name: 'Organise PDF' })).toBeVisible();
      await page.waitForLoadState('networkidle'); // let React finish before Playwright touches the page for a screenshot
      await page.screenshot({ path: `${SHOTS}/pdf-hub-redesign-${width}-${scheme}-fold.png` });
      await page.screenshot({ path: `${SHOTS}/pdf-hub-redesign-${width}-${scheme}.png`, fullPage: true });

      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no horizontal scroll').toBe(true);
      const outside = await page.evaluate(() =>
        [...document.querySelectorAll('#pdf-directory a, section[aria-labelledby="popular-pdf"] a')]
          .filter((e) => {
            const r = e.getBoundingClientRect();
            return r.left < -0.5 || r.right > window.innerWidth + 0.5;
          })
          .map((e) => e.textContent?.trim().slice(0, 30)),
      );
      expect(outside, 'cards stay inside the screen').toEqual([]);
      // Cards in one row are one height, and none is squeezed narrow; each group fills the row (no hole at the end of a short row).
      const rows = await directory(page).locator('ul').evaluateAll((uls) =>
        uls.map((ul) => {
          const r = [...ul.querySelectorAll(':scope > li > a, :scope > li > div')].map((e) => e.getBoundingClientRect());
          const byTop = new Map<number, DOMRect[]>();
          for (const x of r) byTop.set(Math.round(x.top), [...(byTop.get(Math.round(x.top)) ?? []), x]);
          const ulr = ul.getBoundingClientRect();
          return [...byTop.values()].map((row) => ({
            sameHeight: Math.max(...row.map((x) => x.height)) - Math.min(...row.map((x) => x.height)) < 1.5,
            minWidth: Math.min(...row.map((x) => x.width)),
            filled: Math.abs(Math.max(...row.map((x) => x.right)) - ulr.right) < 2,
          }));
        }).flat(),
      );
      for (const row of rows) {
        expect(row.sameHeight, 'cards in a row are one height').toBe(true);
        expect(row.filled, 'a row reaches the right edge of the group').toBe(true);
        if (width >= 768) expect(row.minWidth, 'no card is squeezed').toBeGreaterThanOrEqual(width >= 1024 ? 300 : 240);
      }
      expect(problems).toEqual([]);
    });
  }
}
