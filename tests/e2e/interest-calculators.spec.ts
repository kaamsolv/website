import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

/**
 * SIP, FD, RD, simple and compound interest calculators: live answers, refusals, the SEO tags and structured data on each page,
 * and the Share card that every tool page now carries. The maths itself is checked in test/interest.test.mts.
 */

const SHOTS = 'test-results/screenshots';
const SITE = 'https://kaamsolv.com';

type Case = { slug: string; h1: string; fill: Record<string, string>; answer: string; faqFirst: string };
const CASES: Case[] = [
  { slug: 'sip-calculator', h1: 'SIP calculator', fill: { 'sip-amount': '5,000', 'sip-rate': '12', 'sip-years': '10' }, answer: '₹11,61,695.38', faqFirst: 'What is a SIP?' },
  { slug: 'fd-calculator', h1: 'FD calculator', fill: { 'fd-amount': '1,00,000', 'fd-rate': '7', 'fd-years': '1' }, answer: '₹1,07,185.90', faqFirst: 'How is FD interest calculated?' },
  { slug: 'rd-calculator', h1: 'RD calculator', fill: { 'rd-amount': '5,000', 'rd-rate': '6.5', 'rd-years': '5' }, answer: '₹3,54,954.10', faqFirst: 'How is RD maturity calculated?' },
  { slug: 'simple-interest-calculator', h1: 'Simple interest calculator', fill: { 'si-amount': '50,000', 'si-rate': '6', 'si-years': '3' }, answer: '₹9,000.00', faqFirst: 'What is the simple interest formula?' },
  { slug: 'compound-interest-calculator', h1: 'Compound interest calculator', fill: { 'ci-amount': '1,00,000', 'ci-rate': '10', 'ci-years': '3' }, answer: '₹1,33,100.00', faqFirst: 'What is the compound interest formula?' },
];

async function open(page: Page, slug: string) {
  await page.goto(`/${slug}`);
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
}
const fillAll = async (page: Page, fill: Record<string, string>) => {
  for (const [id, value] of Object.entries(fill)) await page.locator(`#${id}`).fill(value);
};

for (const c of CASES) {
  test(`${c.slug}: live answer, refusals, nothing sent`, async ({ page }) => {
    const sent: string[] = [];
    page.on('request', (r) => {
      if (['POST', 'PUT', 'PATCH'].includes(r.method())) sent.push(`${r.method()} ${r.url()}`);
    });
    await open(page, c.slug);
    await expect(page.getByTestId('calc-error')).toHaveCount(0); // a fresh form is never red
    await fillAll(page, c.fill);
    const tool = page.locator('section[aria-labelledby="tool-title"]'); // the tool, not the FAQ below it, which quotes the same example
    await expect(tool.getByText(c.answer).first()).toBeVisible();
    await expect(page.getByTestId('calc-error')).toHaveCount(0);

    // A silly rate is refused calmly, and the answer goes away rather than showing nonsense.
    const rateId = Object.keys(c.fill).find((k) => k.endsWith('-rate'))!;
    await page.locator(`#${rateId}`).fill('99');
    await expect(page.getByTestId('calc-error')).toBeVisible();
    await expect(tool.getByText(c.answer)).toHaveCount(0);
    await page.locator(`#${rateId}`).fill(c.fill[rateId]);
    await expect(tool.getByText(c.answer).first()).toBeVisible();
    expect(sent).toEqual([]);
  });

  test(`${c.slug}: SEO tags and structured data`, async ({ page }) => {
    await open(page, c.slug);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('h1')).toHaveText(c.h1);
    const title = await page.title();
    expect(title.length, title).toBeLessThanOrEqual(70);
    expect(title).toContain('KaamSolv');
    const meta = (sel: string) => page.locator(sel).first().getAttribute('content');
    const description = (await meta('meta[name="description"]')) ?? '';
    expect(description.length, description).toBeGreaterThan(80);
    expect(description.length, description).toBeLessThanOrEqual(160);
    expect(await page.locator('link[rel="canonical"]').getAttribute('href')).toBe(`${SITE}/${c.slug}`);
    expect(((await meta('meta[name="keywords"]')) ?? '').length).toBeGreaterThan(10);
    expect(await meta('meta[property="og:title"]')).toContain('KaamSolv');
    expect(await meta('meta[property="og:type"]')).toBe('website');
    expect(await meta('meta[property="og:site_name"]')).toBe('KaamSolv');
    expect(await meta('meta[property="og:locale"]')).toBe('en_IN');
    expect(await meta('meta[property="og:url"]')).toContain(`/${c.slug}`);
    expect(await meta('meta[property="og:image"]')).toContain('/og-default.png');
    expect(await meta('meta[property="og:image:width"]')).toBe('1200');
    expect(await meta('meta[name="twitter:card"]')).toBe('summary_large_image');
    expect(await meta('meta[name="twitter:image"]')).toContain('/og-default.png');
    expect(await page.locator('link[rel="alternate"][hreflang="en-IN"]').getAttribute('href')).toContain(`/${c.slug}`);
    expect(await meta('meta[name="robots"]')).toContain('index');
    expect(((await meta('meta[name="googlebot"]')) ?? '')).toContain('max-image-preview:large');

    // The social image really exists and is a picture.
    const img = await page.request.get('/og-default.png');
    expect(img.status()).toBe(200);
    expect(img.headers()['content-type']).toContain('image/png');

    // Structured data: parses, has the four pieces, and every FAQ question is visible on the page.
    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    const graph = blocks.flatMap((b) => (JSON.parse(b) as { '@graph': { '@type': string }[] })['@graph']);
    const types = graph.map((g) => g['@type']);
    for (const t of ['WebApplication', 'BreadcrumbList', 'FAQPage', 'Organization']) expect(types, t).toContain(t);
    const faq = graph.find((g) => g['@type'] === 'FAQPage') as unknown as { mainEntity: { name: string; acceptedAnswer: { text: string } }[] };
    expect(faq.mainEntity[0].name).toBe(c.faqFirst);
    expect(faq.mainEntity.length).toBeGreaterThanOrEqual(5);
    for (const q of faq.mainEntity) {
      expect(q.acceptedAnswer.text.length).toBeGreaterThan(20);
      await expect(page.locator('summary', { hasText: q.name }).first()).toBeAttached();
    }
    expect(await page.request.get('/sitemap.xml').then((r) => r.text())).toContain(`${SITE}/${c.slug}`);
  });
}

test('SIP: a yearly step-up raises both what you put in and what it becomes', async ({ page }) => {
  await open(page, 'sip-calculator');
  await fillAll(page, { 'sip-amount': '5,000', 'sip-rate': '12', 'sip-years': '10', 'sip-step': '10' });
  await expect(page.getByText('₹16,87,163.13').first()).toBeVisible();
  await expect(page.getByText('₹9,56,245.48').first()).toBeVisible();
  await page.getByTestId('growth-chart').locator('label').filter({ hasText: /^Table$/ }).click();
  await expect(page.getByTestId('year-table').getByRole('row')).toHaveCount(11); // header + 10 years
});

test('FD: the compounding choice changes the answer; the year table opens', async ({ page }) => {
  await open(page, 'fd-calculator');
  await fillAll(page, { 'fd-amount': '1,00,000', 'fd-rate': '7', 'fd-years': '1' });
  await expect(page.getByText('₹1,07,185.90').first()).toBeVisible();
  await page.locator('label').filter({ hasText: /^Yearly$/ }).click();
  await expect(page.getByText('₹1,07,000.00').first()).toBeVisible();
  await page.locator('label').filter({ hasText: /^Monthly$/ }).click();
  await expect(page.getByText('₹1,07,229.01').first()).toBeVisible();
});

test('Copy puts a plain sentence with the numbers on the clipboard', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:3000' });
  await open(page, 'simple-interest-calculator');
  await fillAll(page, { 'si-amount': '50,000', 'si-rate': '6', 'si-years': '3' });
  await page.getByRole('button', { name: /^Copy/ }).first().click();
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toContain('Simple interest on ₹50,000.00 at 6% a year for 3y');
  expect(text).toContain('₹9,000.00');
});

test('every tool page has the Share card: WhatsApp message with the page address, copy link, and no tracking parameters', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:3000' });
  for (const slug of ['sip-calculator', 'gst-calculator', 'age-calculator']) {
    await open(page, slug);
    const card = page.getByTestId('share-tool');
    await expect(card).toBeVisible();
    await expect(card).toContainText('Pass it on');
    const href = (await page.getByTestId('share-whatsapp-tool').getAttribute('href')) ?? '';
    expect(href.startsWith('https://wa.me/?text=')).toBe(true);
    const message = decodeURIComponent(href.split('?text=')[1]);
    expect(message).toContain('on KaamSolv');
    expect(message).toContain(`${SITE}/${slug}`);
    expect(message).not.toMatch(/utm_|\?ref|gclid/);
    await page.getByTestId('share-copy-tool').click();
    await expect(page.getByTestId('share-copy-tool')).toContainText('Link copied');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${SITE}/${slug}`);
  }
});

for (const scheme of ['light', 'dark'] as const) {
  for (const [name, viewport] of [['desktop', { width: 1280, height: 900 }], ['phone', { width: 375, height: 812 }]] as const) {
    test(`screenshot ${name} ${scheme}: SIP with the year table, and the Share card; no sideways scroll`, async ({ page }) => {
      await mkdir(SHOTS, { recursive: true });
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: scheme });
      await open(page, 'sip-calculator');
      await fillAll(page, { 'sip-amount': '5,000', 'sip-rate': '12', 'sip-years': '10', 'sip-step': '10' });
      await page.locator('section[aria-labelledby="tool-title"]').screenshot({ path: `${SHOTS}/interest-${name}-${scheme}.png` });
      expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), 'no horizontal scroll').toBe(false);
      for (const slug of ['fd-calculator', 'rd-calculator', 'simple-interest-calculator', 'compound-interest-calculator']) {
        await open(page, slug);
        expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), `${slug} has no horizontal scroll`).toBe(false);
      }
    });
  }
}
