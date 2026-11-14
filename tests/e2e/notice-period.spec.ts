import { mkdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

/**
 * Notice Period Calculator (/notice-period-calculator): known answers on real dates (1 Jan 2027 is a Friday, 31 Jan 2027 a
 * Sunday), both ways of starting the count, calendar and working days, months, the reverse question, weekends, leave, buyout, the
 * calendar strip and its Table, sharing, the calendar file, nothing uploaded, search and catalogue, and phone widths.
 */
const SHOTS = 'test-results/screenshots';
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const labelOf = (iso: string, add = 0) => {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + add));
  return `${WD[dt.getUTCDay()]} ${dt.getUTCDate()} ${MON[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`;
};

const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
const date = (page: Page) => page.locator('#np-date');
const notice = (page: Page) => page.getByLabel('Notice period', { exact: true });
const answer = (page: Page) => page.getByTestId('np-answer');
const group = (page: Page, name: string) => page.getByRole('group', { name });
const pick = (page: Page, name: string, text: string | RegExp) => group(page, name).locator('label').filter({ hasText: typeof text === 'string' ? new RegExp(`^${text}$`) : text }).click();
const more = (page: Page) => page.getByTestId('np-more');

/** Opens the page and waits for it to set today's date (it does so once loaded), then sets the date under test. */
async function open(page: Page, iso = '2027-01-01') {
  await page.goto('/notice-period-calculator');
  await expect(date(page)).not.toHaveValue('', { timeout: 30_000 });
  await date(page).fill(iso);
  await expect(date(page)).toHaveValue(iso);
}
const expectLast = (page: Page, text: string) => expect(answer(page)).toContainText(text);

test('opens ready: today’s date, a 30-day notice, a date, the rule in words, and no errors', async ({ page }) => {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('console', (m) => m.type() === 'error' && problems.push(m.text()));
  await page.goto('/notice-period-calculator');
  await expect(page).toHaveTitle(/Notice period calculator/);
  await expect(page.getByRole('heading', { level: 1, name: 'Notice period calculator' })).toBeVisible();
  await expect(date(page)).not.toHaveValue('', { timeout: 30_000 });
  const today = await date(page).inputValue();
  await expect(notice(page)).toHaveValue('30');
  await expectLast(page, labelOf(today, 30));
  await expect(page.getByTestId('np-rule')).toHaveText('30 days, counted in calendar days, starting the day after you resign.');
  await expect(page.getByTestId('np-relative')).toContainText('That is in 30 days.');
  await expect(page.getByTestId('notice-strip')).toBeVisible();
  await expect(page.getByText('Nothing you enter leaves your browser.')).toBeVisible();
  expect(problems, 'no console or page errors').toEqual([]);
});

test('the known answer: 30 days from Fri 1 Jan 2027 ends on Sun 31 Jan, and the page says it is a weekend', async ({ page }) => {
  await open(page);
  await expectLast(page, 'Sun 31 Jan 2027');
  await expect(page.getByTestId('np-weekend')).toContainText('That is a Sunday');
  await expect(page.getByTestId('np-weekend')).toContainText('Fri 29 Jan');
  // the calendar strip: 30 notice days, ten of them weekend days, the day you resign ringed, the last day marked
  const strip = page.getByTestId('notice-strip');
  await expect(strip.locator('[data-in-notice="1"]')).toHaveCount(30);
  await expect(strip.locator('[data-off="1"]')).toHaveCount(10);
  await expect(strip.locator('[data-resign="1"]')).toHaveText('1');
  await expect(strip.locator('[data-last="1"]')).toHaveText('31');
  await expect(strip).toHaveAttribute('aria-label', /Notice from Sat 2 Jan 2027 to Sun 31 Jan 2027: 30 calendar days, 10 weekend days among them\. You resign Fri 1 Jan 2027\./);
  // the same facts as a table
  await pick(page, 'Show the notice as', 'Table');
  const table = page.getByTestId('np-table');
  await expect(table).toContainText('Fri 1 Jan 2027');
  await expect(table).toContainText('Sat 2 Jan 2027');
  await expect(table).toContainText('Sun 31 Jan 2027');
  await expect(table.locator('div').filter({ hasText: 'Weekend days in it' }).getByText('10', { exact: true })).toBeVisible();
  await expect(page.getByTestId('notice-strip')).toHaveCount(0);
  await pick(page, 'Show the notice as', 'Calendar');
  await expect(page.getByTestId('notice-strip')).toBeVisible();
});

test('counting the day you resign as day one ends a day earlier', async ({ page }) => {
  await open(page);
  await pick(page, 'Notice starts', 'The day I resign');
  await expectLast(page, 'Sat 30 Jan 2027');
  await expect(page.getByTestId('np-rule')).toHaveText('30 days, counted in calendar days, counting the day you resign as day one.');
  await expect(page.getByTestId('np-weekend')).toContainText('That is a Saturday');
  await expect(page.getByTestId('notice-strip').locator('[data-resign="1"]')).toHaveAttribute('data-in-notice', '1');
});

test('working days skip weekends', async ({ page }) => {
  await open(page);
  await pick(page, 'How days are counted', 'Working days, Mon to Fri');
  await expectLast(page, 'Fri 12 Feb 2027');
  await expect(page.getByTestId('np-rule')).toHaveText('30 working days (Monday to Friday), starting the day after you resign.');
  await expect(page.getByTestId('np-weekend')).toHaveCount(0);
  await pick(page, 'How days are counted', 'Working days, Mon to Sat');
  await expectLast(page, 'Fri 5 Feb 2027');
  await more(page).locator('summary').click();
  await expect(more(page)).toContainText('the notice never ends on a weekend');
});

test('months: calendar months, short months and leap years, and the unit switch converts', async ({ page }) => {
  await open(page);
  await pick(page, 'Notice period is in', 'Months');
  await expect(notice(page)).toHaveValue('1'); // 30 days becomes 1 month
  await expectLast(page, 'Mon 1 Feb 2027');
  await expect(page.getByText('Months are counted on the calendar')).toBeVisible();
  await expect(group(page, 'How days are counted')).toHaveCount(0);
  await notice(page).fill('3');
  await date(page).fill('2026-11-15');
  await expectLast(page, 'Mon 15 Feb 2027');
  await date(page).fill('2027-01-30');
  await notice(page).fill('1');
  await expectLast(page, 'Sun 28 Feb 2027'); // there is no 31 February
  await date(page).fill('2028-01-30');
  await expectLast(page, 'Tue 29 Feb 2028'); // a leap year
  await expect(page.getByTestId('np-rule')).toHaveText('1 month, counted on the calendar, starting the day after you resign.');
  await notice(page).fill('2');
  await pick(page, 'Notice period is in', 'Days');
  await expect(notice(page)).toHaveValue('60'); // 2 months back to days
  await pick(page, 'Notice period is in', 'Months');
  await expect(notice(page)).toHaveValue('2');
});

test('the reverse question: the latest day to resign for a new job', async ({ page }) => {
  await open(page, '2027-03-01');
  await pick(page, 'What do you know?', 'I know when the new job starts');
  await expect(page.getByText('New job starts on')).toBeVisible();
  await expect(answer(page)).toContainText('Resign by');
  await expectLast(page, 'Fri 29 Jan 2027');
  await expect(page.getByTestId('np-join-last')).toContainText('Sun 28 Feb 2027');
  await pick(page, 'How days are counted', 'Working days, Mon to Fri');
  await expectLast(page, 'Sun 17 Jan 2027');
  await expect(page.getByTestId('np-join-last')).toContainText('Fri 26 Feb 2027');
  await expect(page.getByTestId('np-join-last')).toContainText('or the working day before it');
  // the forward answer for that date really does land on the day before the job starts
  await pick(page, 'What do you know?', 'I know when I’ll resign');
  await date(page).fill('2027-01-17');
  await expectLast(page, 'Fri 26 Feb 2027');
});

test('a weekend last day: keep it, or move it to the working day before (under More and as a suggestion)', async ({ page }) => {
  await open(page);
  await expectLast(page, 'Sun 31 Jan 2027');
  await more(page).locator('summary').click();
  await pick(page, 'If the last day is a weekend', 'Move to the working day before');
  await expectLast(page, 'Fri 29 Jan 2027');
  await expect(page.getByTestId('np-moved')).toHaveText('Moved from Sun 31 Jan to the working day before.');
  await expect(page.getByTestId('np-weekend')).toHaveCount(0);
  await pick(page, 'If the last day is a weekend', 'Keep that date');
  await expectLast(page, 'Sun 31 Jan 2027');
  // the suggestion applies the same choice with one tap
  await page.getByTestId('nudges').locator('li').filter({ hasText: 'moves a weekend last day' }).getByRole('button', { name: 'Try it' }).click();
  await expectLast(page, 'Fri 29 Jan 2027');
});

test('what if: serve 10 days less, in one tap', async ({ page }) => {
  await open(page);
  const nudge = page.getByTestId('nudges').locator('li').filter({ hasText: 'Serve 10 days less' });
  await expect(nudge).toContainText('Thu 21 Jan 2027');
  await nudge.getByRole('button', { name: 'Try it' }).click();
  await expect(notice(page)).toHaveValue('20');
  await expectLast(page, 'Thu 21 Jan 2027');
});

test('slider, box and quick picks stay in step; the limits are said plainly', async ({ page }) => {
  await open(page);
  await pick(page, 'Common notice periods', '60 days');
  await expect(notice(page)).toHaveValue('60');
  await expectLast(page, 'Tue 2 Mar 2027');
  const slider = page.getByRole('slider', { name: 'Notice period, slider' });
  await slider.focus();
  await page.keyboard.press('End');
  await expect(notice(page)).toHaveValue('180');
  await page.keyboard.press('Home');
  await expect(notice(page)).toHaveValue('0');
  await notice(page).fill('365');
  await expectLast(page, 'Sat 1 Jan 2028');
  await expect(slider).toHaveValue('180'); // typing past the slider still counts
  await notice(page).fill('366');
  await expect(page.getByText('Notice can be 0 to 365 days, in whole days.')).toBeVisible();
  await expect(answer(page)).toContainText('—');
  await expect(page.getByText('Fix the notice period above to see your answer.')).toBeVisible();
  await notice(page).fill('12.5');
  await expect(page.getByText('Notice can be 0 to 365 days, in whole days.')).toBeVisible();
  await notice(page).fill('30');
  await expectLast(page, 'Sun 31 Jan 2027');
});

test('no notice: the last day is the day you resign', async ({ page }) => {
  await open(page);
  await notice(page).fill('0');
  await expectLast(page, 'Fri 1 Jan 2027');
  await expect(page.getByTestId('np-rule')).toHaveText('No notice period, so your last day is the day you resign.');
  await expect(page.getByTestId('notice-strip').locator('[data-in-notice="1"]')).toHaveCount(0);
  await expect(page.getByTestId('notice-strip').locator('[data-last="1"]')).toHaveText('1');
});

test('a blank or impossible date says so and recovers; Today puts it back', async ({ page }) => {
  await open(page);
  await date(page).fill('');
  await expect(answer(page)).toContainText('—');
  await expect(page.getByText('Pick a date to see your answer.')).toBeVisible();
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(date(page)).not.toHaveValue('', { timeout: 30_000 });
  await expect(answer(page)).not.toContainText('—');
});

test('very long notices fold the middle of the calendar and still fit', async ({ page }) => {
  await open(page);
  await notice(page).fill('365');
  await expect(page.getByTestId('notice-gap')).toContainText(/\d+ more weeks/);
  expect(await page.getByTestId('notice-strip').evaluate((el) => el.getBoundingClientRect().height)).toBeLessThan(900);
  expect(await sideways(page)).toBe(false);
});

test('leave at the end of notice: your last day in the office, the official day stays', async ({ page }) => {
  await open(page);
  await more(page).locator('summary').click();
  await page.getByLabel('Leave at the end of notice', { exact: true }).fill('3');
  await expect(page.getByTestId('np-office')).toContainText('your last day in the office is Wed 27 Jan 2027');
  await expect(page.getByTestId('np-office')).toContainText('Your official last working day stays Sun 31 Jan');
  await expectLast(page, 'Sun 31 Jan 2027'); // the official date has not moved
  await page.getByLabel('Leave at the end of notice', { exact: true }).fill('30');
  await expect(page.getByTestId('np-office')).toContainText('Your leave covers the whole notice');
});

test('leaving sooner: days short and a rough buyout, with the divisor choice and a plain range check', async ({ page }) => {
  await open(page);
  await more(page).locator('summary').click();
  await expect(page.getByTestId('np-buyout')).toHaveCount(0);
  await page.locator('#np-leaveon').fill('2027-01-24');
  await expect(page.getByTestId('np-buyout')).toContainText('Leaving on Sun 24 Jan 2027 is 7 days short of your notice.');
  await expect(page.getByTestId('np-buyout')).toContainText('₹50,000 ÷ 30 × 7 = ₹11,667');
  await expect(page.getByTestId('np-buyout')).toContainText('Your offer letter sets the real figure.');
  await pick(page, 'Divisor', '26');
  await expect(page.getByTestId('np-buyout')).toContainText('₹50,000 ÷ 26 × 7 = ₹13,462');
  await page.getByLabel('Your monthly pay', { exact: true }).fill('80,000');
  await expect(page.getByTestId('np-buyout')).toContainText('₹80,000 ÷ 26 × 7 = ₹21,538');
  await page.locator('#np-leaveon').fill('2027-03-01');
  await expect(page.getByTestId('np-buyout')).toHaveCount(0);
  await expect(page.getByText(/Pick a leaving date from Fri 1 Jan to the day before Sun 31 Jan\./)).toBeVisible();
  // working days: the days short are working days
  await page.locator('#np-leaveon').fill('2027-01-24');
  await pick(page, 'How days are counted', 'Working days, Mon to Fri');
  await page.locator('#np-leaveon').fill('2027-02-05');
  await expect(page.getByTestId('np-buyout')).toContainText('5 working days short');
});

test('share and keep: WhatsApp message, the calendar file, print, and nothing uploaded', async ({ page, context }) => {
  const sent: string[] = [];
  page.on('request', (r) => {
    if (['POST', 'PUT', 'PATCH'].includes(r.method())) sent.push(`${r.method()} ${r.url()}`);
  });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(page.url() === 'about:blank' ? 'http://localhost:3000' : page.url()).origin });
  await open(page);
  const href = (await page.getByTestId('np-whatsapp').getAttribute('href'))!;
  expect(href.startsWith('https://wa.me/?text=')).toBe(true);
  const text = decodeURIComponent(href.slice('https://wa.me/?text='.length));
  expect(text).toContain('My last working day is Sun 31 Jan 2027.');
  expect(text).toContain('30 days, counted in calendar days, starting the day after you resign.');
  expect(text).toContain('Worked out on KaamSolv.');
  expect(text).toContain('/notice-period-calculator');
  expect(text, 'no date goes into a link').not.toMatch(/\?[a-z]+=/);

  const [file] = await Promise.all([page.waitForEvent('download'), page.getByTestId('np-ics').click()]);
  expect(file.suggestedFilename()).toBe('last-working-day.ics');
  const ics = await readFile((await file.path())!, 'utf8');
  expect(ics).toContain('BEGIN:VCALENDAR');
  expect(ics).toContain('DTSTART;VALUE=DATE:20270131');
  expect(ics).toContain('DTEND;VALUE=DATE:20270201');
  expect(ics).toContain('SUMMARY:Last working day');
  expect(ics).toContain('\r\n');

  await expect(page.getByTestId('np-print')).toBeVisible();
  await page.getByRole('button', { name: 'Copy' }).first().click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain('My last working day is Sun 31 Jan 2027.');
  expect(sent, 'nothing is sent anywhere').toEqual([]);
});

test('the reverse answer is shared in the right words', async ({ page }) => {
  await open(page, '2027-03-01');
  await pick(page, 'What do you know?', 'I know when the new job starts');
  const href = (await page.getByTestId('np-whatsapp').getAttribute('href'))!;
  const text = decodeURIComponent(href.slice('https://wa.me/?text='.length));
  expect(text).toContain('To start my new job on Mon 1 Mar 2027, I need to resign by Fri 29 Jan 2027.');
  expect(text).toContain('My last working day will be Sun 28 Feb 2027.');
});

test('every input explains itself with an "i", and the notes open', async ({ page }) => {
  await open(page);
  await more(page).locator('summary').click();
  const buttons = page.getByRole('button', { name: 'What does this mean?' });
  const total = await buttons.count();
  expect(total).toBeGreaterThanOrEqual(9);
  for (let i = 0; i < total; i++) await buttons.nth(i).click();
  await expect(page.getByTestId('info-note')).toHaveCount(total);
  await expect(page.getByTestId('info-note').first()).toContainText('The day you hand in your resignation.');
});

test('the mode and notice-start choices fit their box and work from the keyboard', async ({ page }) => {
  await open(page);
  const card = (await page.locator('#np-date').locator('xpath=ancestor::div[contains(@class,"space-y-5")][1]').boundingBox())!;
  for (const name of ['What do you know?', 'Notice starts']) {
    const box = (await group(page, name).locator('div').first().boundingBox())!;
    expect(box.x + box.width, `${name} stays inside its card`).toBeLessThanOrEqual(card.x + card.width + 1);
  }
  await group(page, 'What do you know?').getByRole('radio').first().focus();
  await page.keyboard.press('ArrowRight');
  await expect(answer(page)).toContainText('Resign by');
});

test('found by task, listed under Career, in the sitemap, with structured data', async ({ page }) => {
  await page.goto('/');
  const search = page.getByRole('combobox', { name: 'Search for a tool' });
  await search.fill('when do i resign');
  const option = page.getByRole('option', { name: /Find my last working day/ });
  await expect(option.first()).toBeVisible();
  await option.first().click();
  await expect(page).toHaveURL(/\/notice-period-calculator$/);
  await expect(page.getByRole('navigation', { name: /breadcrumb/i }).getByText('Career')).toBeVisible();
  const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').first().textContent())!);
  const types = ld['@graph'].map((x: { '@type': string }) => x['@type']);
  expect(types).toEqual(expect.arrayContaining(['WebApplication', 'FAQPage', 'BreadcrumbList']));
  await page.goto('/tools');
  await expect(page.getByRole('link', { name: /Notice Period Calculator/ }).first()).toBeVisible();
  expect(await (await page.request.get('/sitemap.xml')).text()).toContain('/notice-period-calculator');
  await page.goto('/notice-period-calculator');
  await expect(page.getByRole('heading', { name: 'Related tools' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Gratuity Calculator/ }).first()).toBeVisible();
});

for (const scheme of ['light', 'dark'] as const) {
  for (const width of [375, 360, 320]) {
    test.describe(`phone ${width}px ${scheme}`, () => {
      test.use({ viewport: { width, height: 800 }, hasTouch: true, isMobile: true });

      test('everything open still fits: strip, table, More, notes; the answer rides on top while you drag', async ({ page }) => {
        mkdirSync(SHOTS, { recursive: true });
        await page.emulateMedia({ colorScheme: scheme });
        await open(page);
        for (const b of await page.getByRole('button', { name: 'What does this mean?' }).all()) await b.click();
        await more(page).locator('summary').click();
        for (const b of await more(page).getByRole('button', { name: 'What does this mean?' }).all()) await b.click();
        await page.locator('#np-leaveon').fill('2027-01-24');
        await more(page).getByLabel('Leave at the end of notice', { exact: true }).fill('3');
        expect(await sideways(page), 'inputs, notes and More open').toBe(false);
        await expect(page.getByTestId('np-buyout')).toBeVisible();

        // the answer rides at the top of the inputs while you work them
        await page.getByLabel('Notice period', { exact: true }).scrollIntoViewIfNeeded();
        const sticky = page.locator('.sticky', { hasText: 'Last working day' }).first();
        await expect(sticky).toContainText('Sun 31 Jan');
        const sb = (await sticky.boundingBox())!;
        expect(sb.y).toBeLessThan(200);

        // touch targets
        for (const el of [page.getByRole('button', { name: 'Today', exact: true }), page.getByTestId('np-ics'), page.getByTestId('np-print'), page.getByTestId('np-whatsapp'), ...(await group(page, 'How days are counted').locator('label').all()), ...(await group(page, 'Notice starts').locator('label').all())]) {
          const box = (await el.boundingBox())!;
          expect(box.height, 'touch target').toBeGreaterThanOrEqual(44);
        }
        for (const label of await group(page, 'What do you know?').locator('label').all()) {
          const box = (await label.boundingBox())!;
          expect(box.x + box.width, 'mode choice inside the screen').toBeLessThanOrEqual(width);
        }

        await page.getByTestId('np-picture').scrollIntoViewIfNeeded();
        await page.screenshot({ path: `${SHOTS}/notice-strip-${width}-${scheme}.png` });
        const strip = (await page.getByTestId('notice-strip').boundingBox())!;
        expect(strip.x).toBeGreaterThanOrEqual(0);
        expect(strip.x + strip.width).toBeLessThanOrEqual(width);
        expect(await sideways(page), 'calendar strip').toBe(false);
        await pick(page, 'Show the notice as', 'Table');
        expect(await sideways(page), 'table').toBe(false);
        await page.screenshot({ path: `${SHOTS}/notice-table-${width}-${scheme}.png` });
        await notice(page).fill('365');
        await pick(page, 'Show the notice as', 'Calendar');
        expect(await sideways(page), 'a very long notice').toBe(false);
        await page.locator('main').screenshot({ path: `${SHOTS}/notice-full-${width}-${scheme}.png` });
      });
    });
  }
}
