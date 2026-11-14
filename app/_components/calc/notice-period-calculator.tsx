'use client';

import { useEffect, useMemo, useState } from 'react';
import { Chips, Segmented } from '../choice';
import { WHATSAPP_BUTTON } from '../whatsapp-style';
import { Answer, FIELD } from './everyday-calculators';
import { InfoHeading } from './info-tip';
import { Frame, Problem } from './interest-calculators';
import { NoticeStrip } from './notice-strip';
import { Nudges, type Nudge } from './result-extras';
import { SliderField } from './slider-field';
import { parseAmount } from '@/app/lib/calc/everyday';
import { downloadBlob } from '@/app/lib/image/export';
import {
  buildRibbon,
  buyoutAmount,
  dayFromYmd,
  dayLabel,
  isoDay,
  isValidNotice,
  lastDayIcs,
  lastDayInOffice,
  lastWorkingDay,
  latestResignDate,
  MAX_DAYS,
  MAX_MONTHS,
  parseDay,
  relativeDays,
  ruleSentence,
  shortfall,
  weekendNote,
  type CountRule,
  type Day,
  type FirstDay,
  type NoticeResult,
  type NoticeUnit,
  type WeekendRule,
} from '@/app/lib/notice/calc';
import { SITE_ORIGIN } from '@/app/lib/site-urls';

type Mode = 'resign' | 'join';
type View = 'calendar' | 'table';

/** Plain-words notes behind the small "i" buttons. No jargon, no advice. */
const HELP = {
  resign: 'The day you hand in your resignation. If you already have, pick that day, even if it was in the past.',
  join: 'The first day at your new job. We work backwards to the latest day you can resign and still finish your notice before it.',
  notice: 'How long your offer letter or contract says you must serve. 30, 60 and 90 days are common. Some letters say 1, 2 or 3 months instead.',
  count: 'Most letters count every calendar day, weekends and holidays included. Some count only working days. If yours does not say, ask HR which one payroll uses.',
  first: 'Companies differ on whether the day you resign is day one. The most common is that notice starts the next day. Your HR portal shows the official date.',
  weekend: 'If the notice ends on a Saturday or Sunday, some companies end it on the Friday before and others keep the date. This only changes the date you see here.',
  leave: 'Working days of leave you plan to take at the end of notice. Your official last day does not change. This shows your last day in the office.',
  leaveOn: 'Optional. A date earlier than your last working day, if you plan to buy out the rest of your notice.',
  pay: 'Your monthly gross pay. Some employers use basic pay instead. It is only used for the estimate.',
  divisor: 'The number your monthly pay is divided by to get one day of pay. 30 is the common choice and some employers use 26 working days. Check your letter.',
} as const;

const QUICK: Record<NoticeUnit, number[]> = { days: [15, 30, 60, 90], months: [1, 2, 3, 6] };
const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function localToday(): Day {
  const t = new Date();
  return dayFromYmd(t.getFullYear(), t.getMonth() + 1, t.getDate());
}

/**
 * The Notice Period Calculator: your last working day from the day you resign, or the latest day to resign for a new job's start
 * date, worked out live as you change anything. The rule it used is always said back in words, and the calendar strip shows the
 * notice day by day. Everything runs in the browser and nothing is saved or sent. Engine and rules: app/lib/notice/calc.ts
 * (docs/products/notice-period-calculator.md). A notice period is set by your offer letter: this is an estimate to check with HR.
 */
export function NoticePeriodCalculator() {
  const [mode, setMode] = useState<Mode>('resign');
  const [date, setDate] = useState('');
  const [today, setToday] = useState<Day | null>(null);
  const [notice, setNotice] = useState('30');
  const [unit, setUnit] = useState<NoticeUnit>('days');
  const [count, setCount] = useState<CountRule>('calendar');
  const [first, setFirst] = useState<FirstDay>('next');
  const [weekend, setWeekend] = useState<WeekendRule>('keep');
  const [leave, setLeave] = useState('0');
  const [leaveOn, setLeaveOn] = useState('');
  const [pay, setPay] = useState('50,000');
  const [divisor, setDivisor] = useState<26 | 30>(30);
  const [view, setView] = useState<View>('calendar');

  // "Today" is only known in the browser (the page is pre-built), so the date box fills in once the page has loaded.
  useEffect(() => {
    const t = localToday();
    setToday(t);
    setDate(isoDay(t));
  }, []);

  const dateDay = parseDay(date);
  const n = parseAmount(notice);
  const noticeOk = isValidNotice(n, unit);
  const maxNotice = unit === 'months' ? MAX_MONTHS : MAX_DAYS;

  const rule = useMemo(() => ({ notice: n, unit, count, first, weekend }), [n, unit, count, first, weekend]);
  const result: NoticeResult | null = useMemo(() => {
    if (dateDay === null || !noticeOk) return null;
    return mode === 'resign' ? lastWorkingDay({ ...rule, resign: dateDay }) : latestResignDate({ ...rule, joinOn: dateDay });
  }, [mode, dateDay, noticeOk, rule]);

  const shown = result ? (mode === 'resign' ? result.last : result.resign) : null;
  const words = ruleSentence(rule);
  const calendarCounted = unit === 'months' || count === 'calendar';

  const ribbon = useMemo(() => (result ? buildRibbon(result, unit === 'months' ? 'calendar' : count, today) : []), [result, count, unit, today]);
  const label = result
    ? result.calendarDays > 0
      ? `Notice from ${dayLabel(result.start)} to ${dayLabel(result.last)}: ${plural(result.calendarDays, 'calendar day', 'calendar days')}, ${plural(result.weekendDays, 'weekend day', 'weekend days')} among them. You resign ${dayLabel(result.resign)}. Your last working day is ${dayLabel(result.last)}.`
      : `No notice. You resign and finish on ${dayLabel(result.resign)}.`
    : '';

  const summary = result
    ? mode === 'resign'
      ? `My last working day is ${dayLabel(result.last)}. ${words} Worked out on KaamSolv.`
      : `To start my new job on ${dayLabel(dateDay as Day)}, I need to resign by ${dayLabel(result.resign)}. My last working day will be ${dayLabel(result.last)}. ${words} Worked out on KaamSolv.`
    : '';

  // Leave at the end, and leaving sooner (both optional, under "More").
  const leaveDays = Math.max(0, Math.min(30, Math.round(parseAmount(leave) || 0)));
  const office = result && leaveDays > 0 && result.calendarDays > 0 ? lastDayInOffice(result.last, leaveDays, unit === 'months' ? 'calendar' : count, result.start) : null;
  const leaveOnDay = parseDay(leaveOn);
  const payN = parseAmount(pay);
  const short = result && leaveOnDay !== null && result.calendarDays > 0 && leaveOnDay >= result.resign && leaveOnDay < result.last ? shortfall(result.last, leaveOnDay, count, unit) : null;
  const leaveOnOutOfRange = result && leaveOnDay !== null && result.calendarDays > 0 && !(leaveOnDay >= result.resign && leaveOnDay < result.last);

  const weekendInfo = result && calendarCounted && weekend === 'keep' && result.calendarDays > 0 ? weekendNote(result.last) : null;

  const nudges: Nudge[] = [];
  if (result && mode === 'resign' && unit === 'days' && noticeOk && n > 10 && dateDay !== null) {
    const less = Math.min(10, n - 1);
    const earlier = lastWorkingDay({ ...rule, notice: n - less, resign: dateDay });
    nudges.push({ text: `Serve ${less} days less and your last working day is ${dayLabel(earlier.last)}.`, apply: () => setNotice(String(n - less)) });
  }
  if (weekendInfo) nudges.push({ text: `If your company moves a weekend last day to the working day before, yours is ${dayLabel(weekendInfo.before)}.`, apply: () => setWeekend('before') });

  function switchUnit(next: NoticeUnit) {
    if (next === unit) return;
    if (next === 'months') setNotice(Number.isInteger(n) && n > 0 && n % 30 === 0 && n / 30 <= MAX_MONTHS ? String(n / 30) : '1');
    else setNotice(Number.isInteger(n) && n > 0 && n * 30 <= MAX_DAYS ? String(n * 30) : '30');
    setUnit(next);
  }

  function addToCalendar() {
    if (!result) return;
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const ics = lastDayIcs(result.last, stamp, `${words} Worked out on KaamSolv. Check the date with your HR portal.`);
    downloadBlob(new Blob([ics], { type: 'text/calendar;charset=utf-8' }), 'last-working-day.ics');
  }

  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`${summary}\n${SITE_ORIGIN}/notice-period-calculator`)}`;
  const small =
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-hair bg-surface px-4 text-sm font-semibold text-strong transition-colors hover:bg-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 focus-visible:ring-offset-2';

  return (
    <Frame
      stickyLabel={mode === 'resign' ? 'Last working day' : 'Resign by'}
      stickyValue={shown !== null ? dayLabel(shown, false) : null}
      inputs={
        <>
          <Segmented
            legend="What do you know?"
            hideLegend
            fill
            options={[
              { value: 'resign' as const, label: 'I know when I’ll resign' },
              { value: 'join' as const, label: 'I know when the new job starts' },
            ]}
            value={mode}
            onChange={setMode}
          />

          <div>
            <div className="mb-1.5">
              <InfoHeading info={mode === 'resign' ? HELP.resign : HELP.join}>
                <label htmlFor="np-date">{mode === 'resign' ? 'Resignation date' : 'New job starts on'}</label>
              </InfoHeading>
            </div>
            <div className="flex gap-2">
              <input id="np-date" type="date" min="1950-01-01" max="2100-12-31" className={FIELD} value={date} onChange={(e) => setDate(e.target.value)} aria-invalid={date !== '' && dateDay === null ? true : undefined} />
              <button
                type="button"
                onClick={() => setDate(isoDay(localToday()))}
                className="inline-flex h-12 shrink-0 items-center rounded-xl border border-hair bg-surface px-4 text-sm font-semibold text-strong hover:bg-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500"
              >
                Today
              </button>
            </div>
            {date !== '' && dateDay === null && <Problem>Use a real date between 1950 and 2100.</Problem>}
          </div>

          <div className="space-y-4">
            <Segmented
              legend="Notice period is in"
              options={[
                { value: 'days' as const, label: 'Days' },
                { value: 'months' as const, label: 'Months' },
              ]}
              value={unit}
              onChange={switchUnit}
            />
            <SliderField
              id="np-notice"
              label="Notice period"
              value={notice}
              onChange={setNotice}
              min={0}
              max={unit === 'months' ? 6 : 180}
              step={1}
              suffix={unit === 'months' ? 'mo' : 'days'}
              minLabel="0"
              maxLabel={unit === 'months' ? '6 months' : '180 days'}
              info={HELP.notice}
            />
            {!noticeOk && notice.trim() !== '' && (
              <Problem>
                Notice can be 0 to {maxNotice} {unit}, in whole {unit}.
              </Problem>
            )}
            <Chips
              legend="Common notice periods"
              hideLegend
              options={QUICK[unit].map((v) => ({ value: v, label: unit === 'days' ? `${v} days` : `${v} ${v === 1 ? 'month' : 'months'}` }))}
              value={noticeOk && QUICK[unit].includes(n) ? n : undefined}
              onChange={(v) => setNotice(String(v))}
            />
          </div>

          {unit === 'days' ? (
            <div className="space-y-2">
              <InfoHeading info={HELP.count}>How days are counted</InfoHeading>
              <Chips
                legend="How days are counted"
                hideLegend
                options={[
                  { value: 'calendar' as CountRule, label: 'Calendar days' },
                  { value: 'monFri' as CountRule, label: 'Working days, Mon to Fri' },
                  { value: 'monSat' as CountRule, label: 'Working days, Mon to Sat' },
                ]}
                value={count}
                onChange={setCount}
              />
            </div>
          ) : (
            <p className="text-sm text-muted">Months are counted on the calendar: a month runs to the day before the same date next month.</p>
          )}

          <div className="space-y-2">
            <InfoHeading info={HELP.first}>Notice starts</InfoHeading>
            <Segmented
              legend="Notice starts"
              hideLegend
              fill
              options={[
                { value: 'next' as FirstDay, label: 'The day after I resign' },
                { value: 'same' as FirstDay, label: 'The day I resign' },
              ]}
              value={first}
              onChange={setFirst}
            />
          </div>

          <details className="rounded-xl border border-hair px-3 py-2" data-testid="np-more">
            <summary className="min-h-10 cursor-pointer py-1.5 text-sm font-semibold text-ink pointer-coarse:min-h-11">More: a weekend last day, leave, leaving sooner</summary>
            <div className="space-y-5 pb-2 pt-3">
              {calendarCounted ? (
                <div className="space-y-2">
                  <InfoHeading info={HELP.weekend}>If the last day is a weekend</InfoHeading>
                  <Chips
                    legend="If the last day is a weekend"
                    hideLegend
                    options={[
                      { value: 'keep' as WeekendRule, label: 'Keep that date' },
                      { value: 'before' as WeekendRule, label: 'Move to the working day before' },
                    ]}
                    value={weekend}
                    onChange={setWeekend}
                  />
                </div>
              ) : (
                <p className="text-sm text-muted">Counting working days, the notice never ends on a weekend, so there is nothing to choose here.</p>
              )}

              <SliderField id="np-leave" label="Leave at the end of notice" value={leave} onChange={setLeave} min={0} max={30} step={1} suffix="days" minLabel="0" maxLabel="30 days" info={HELP.leave} />

              <div className="space-y-3 rounded-xl bg-wash/60 p-3">
                <div>
                  <div className="mb-1.5">
                    <InfoHeading info={HELP.leaveOn}>
                      <label htmlFor="np-leaveon">I want to leave on (optional)</label>
                    </InfoHeading>
                  </div>
                  <input id="np-leaveon" type="date" min="1950-01-01" max="2100-12-31" className={FIELD} value={leaveOn} onChange={(e) => setLeaveOn(e.target.value)} />
                </div>
                <SliderField id="np-pay" label="Your monthly pay" value={pay} onChange={setPay} min={10000} max={300000} step={1000} prefix="₹" group minLabel="₹10,000" maxLabel="₹3,00,000" info={HELP.pay} />
                <div className="space-y-2">
                  <InfoHeading info={HELP.divisor}>One day of pay is monthly pay divided by</InfoHeading>
                  <Chips
                    legend="Divisor"
                    hideLegend
                    options={[
                      { value: 30 as 26 | 30, label: '30' },
                      { value: 26 as 26 | 30, label: '26' },
                    ]}
                    value={divisor}
                    onChange={setDivisor}
                  />
                </div>
              </div>
            </div>
          </details>
        </>
      }
      results={
        <>
          <div data-testid="np-answer">
            <Answer label={mode === 'resign' ? 'Your last working day' : 'Resign by'} value={shown !== null ? dayLabel(shown) : null} copy={summary || undefined} />
          </div>

          {result === null && <p className="text-sm text-strong">{dateDay === null ? 'Pick a date to see your answer.' : 'Fix the notice period above to see your answer.'}</p>}

          {result && shown !== null && (
            <div className="space-y-1.5" data-testid="np-details">
              {today !== null && (
                <p className="text-sm font-semibold text-ink" data-testid="np-relative">
                  {mode === 'resign' ? `That is ${relativeDays(result.last, today)}.` : `That is ${relativeDays(result.resign, today)}.`}
                </p>
              )}
              <p className="text-sm text-strong" data-testid="np-rule">
                {words}
              </p>
              {mode === 'join' && (
                <p className="text-sm text-strong" data-testid="np-join-last">
                  Your last working day will be <span className="font-semibold text-ink">{dayLabel(result.last)}</span>, the day before the new job starts{result.last < (dateDay as Day) - 1 ? ' or the working day before it' : ''}.
                </p>
              )}
              {result.moved !== null && (
                <p className="text-sm text-strong" data-testid="np-moved">
                  Moved from {dayLabel(result.moved, false)} to the working day before.
                </p>
              )}
              {weekendInfo && (
                <p className="rounded-xl border border-yellow-300 bg-yellowx-100 px-3 py-2 text-sm text-strong" data-testid="np-weekend">
                  {weekendInfo.text}
                </p>
              )}
            </div>
          )}

          {result && (
            <section aria-labelledby="np-picture" data-testid="np-picture">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 id="np-picture" className="text-sm font-bold text-ink">
                  Your notice, day by day
                </h3>
                <Segmented
                  legend="Show the notice as"
                  hideLegend
                  options={[
                    { value: 'calendar' as View, label: 'Calendar' },
                    { value: 'table' as View, label: 'Table' },
                  ]}
                  value={view}
                  onChange={setView}
                />
              </div>
              <div className="mt-3">
                {view === 'calendar' ? (
                  <NoticeStrip weeks={ribbon} label={label} />
                ) : (
                  <dl data-testid="np-table">
                    <TableRow label="You resign" value={dayLabel(result.resign)} />
                    <TableRow label="Notice starts" value={result.calendarDays > 0 ? dayLabel(result.start) : 'No notice'} />
                    <TableRow label="Last working day" value={dayLabel(result.last)} />
                    <TableRow label="Calendar days of notice" value={String(result.calendarDays)} />
                    <TableRow label="Weekdays in it (Mon to Fri)" value={String(result.weekdays)} />
                    <TableRow label="Weekend days in it" value={String(result.weekendDays)} />
                  </dl>
                )}
              </div>
            </section>
          )}

          {office && result && (
            <p className="rounded-xl bg-wash px-3 py-2 text-sm text-strong" data-testid="np-office">
              {office.coversAll ? (
                <>Your leave covers the whole notice, so your last day in the office is the first day of notice, {dayLabel(office.day)}. Your official last working day stays {dayLabel(result.last, false)}.</>
              ) : (
                <>
                  With {plural(leaveDays, 'day', 'days')} of leave at the end, your last day in the office is <span className="font-semibold text-ink">{dayLabel(office.day)}</span>. Your official last working day stays {dayLabel(result.last, false)}.
                </>
              )}
            </p>
          )}

          {result && leaveOnOutOfRange && (
            <Problem>
              Pick a leaving date from {dayLabel(result.resign, false)} to the day before {dayLabel(result.last, false)}.
            </Problem>
          )}
          {result && short !== null && leaveOnDay !== null && (
            <p className="rounded-xl bg-wash px-3 py-2 text-sm text-strong" data-testid="np-buyout">
              Leaving on {dayLabel(leaveOnDay)} is <span className="font-semibold text-ink">{plural(short, unit === 'days' && count !== 'calendar' ? 'working day' : 'day', unit === 'days' && count !== 'calendar' ? 'working days' : 'days')}</span> short of your notice.
              {Number.isFinite(payN) && payN > 0 ? (
                <>
                  {' '}
                  A rough buyout: {rupees(Math.round(payN))} ÷ {divisor} × {short} = <span className="font-semibold text-ink">{rupees(buyoutAmount(short, payN, divisor))}</span>. Your offer letter sets the real figure.
                </>
              ) : (
                ' Add your monthly pay under More for a rough buyout figure.'
              )}
            </p>
          )}

          {result && <Nudges items={nudges} />}

          {result && (
            <div className="flex flex-wrap items-center gap-2.5" data-print-hide data-testid="np-actions">
              <a href={whatsapp} target="_blank" rel="noopener noreferrer" data-testid="np-whatsapp" className={`${WHATSAPP_BUTTON} !min-h-11 !px-4 text-sm`}>
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                  <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91A9.84 9.84 0 0 0 12.04 2zm4.52 11.99c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.12-.17.25-.64.81-.78.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-2-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.5.11-.11.25-.29.37-.43.12-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.23.25-.87.85-.87 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.14-1.18-.06-.1-.23-.16-.48-.29z" />
                </svg>
                Share on WhatsApp
              </a>
              <button type="button" onClick={addToCalendar} className={small} data-testid="np-ics">
                Add last day to calendar
              </button>
              <button type="button" onClick={() => window.print()} className={small} data-testid="np-print">
                Print / save as PDF
              </button>
            </div>
          )}

          <p className="text-xs leading-relaxed text-muted">
            A notice period comes from your offer letter, and companies count it differently. This follows the choices you made above and is an estimate: your HR portal shows the official date. Nothing you enter leaves your browser.
          </p>
        </>
      }
    />
  );
}

function TableRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-hair py-2 text-sm last:border-0">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-semibold text-ink">{value}</dd>
    </div>
  );
}
