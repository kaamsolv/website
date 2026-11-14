/**
 * The notice period engine (app/lib/notice/calc.ts): real dates with known weekdays, both ways of starting the count, calendar
 * and working days, months (month ends and leap years), weekends, the reverse question, leave, buyout, the picture and the
 * calendar file. January 2027 is the main stage: 1 Jan 2027 is a Friday, 31 Jan 2027 a Sunday.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildRibbon,
  buyoutAmount,
  dayFromYmd,
  dayLabel,
  isoDay,
  isOffDay,
  isValidNotice,
  lastDayIcs,
  lastDayInOffice,
  lastWorkingDay,
  latestResignDate,
  parseDay,
  relativeDays,
  ruleSentence,
  shortfall,
  weekday,
  weekendNote,
  type CountRule,
  type Day,
  type FirstDay,
  type NoticeInput,
  type NoticeUnit,
  type WeekendRule,
} from '../app/lib/notice/calc.ts';

const D = (iso: string): Day => {
  const d = parseDay(iso);
  assert.notEqual(d, null, iso);
  return d as Day;
};
const base = (over: Partial<NoticeInput> & { resign: string }): NoticeInput => ({ notice: 30, unit: 'days', count: 'calendar', first: 'next', weekend: 'keep', ...over, resign: D(over.resign) });
const last = (over: Partial<NoticeInput> & { resign: string }) => isoDay(lastWorkingDay(base(over)).last);

test('dates: strict parsing, weekdays and labels', () => {
  assert.equal(parseDay('2027-02-29'), null);
  assert.notEqual(parseDay('2028-02-29'), null);
  for (const bad of ['', ' 2027-01-01', '2027-1-1', '2027-13-01', '2027-00-10', '1949-12-31', '2101-01-01', 'tomorrow', '2027-01-01T00:00']) assert.equal(parseDay(bad), null, bad);
  assert.equal(isoDay(D('2027-01-31')), '2027-01-31');
  assert.equal(weekday(D('1970-01-01')), 4); // Thursday
  assert.equal(weekday(D('2000-01-01')), 6); // Saturday
  assert.equal(weekday(D('2027-01-01')), 5); // Friday
  assert.equal(weekday(D('2027-01-31')), 0); // Sunday
  assert.equal(weekday(dayFromYmd(1969, 12, 31)), 3); // Wednesday, before the epoch
  assert.equal(dayLabel(D('2027-01-31')), 'Sun 31 Jan 2027');
  assert.equal(dayLabel(D('2027-01-31'), false), 'Sun 31 Jan');
  assert.equal(isOffDay(D('2027-01-30'), 'calendar'), true); // Saturday
  assert.equal(isOffDay(D('2027-01-30'), 'monFri'), true);
  assert.equal(isOffDay(D('2027-01-30'), 'monSat'), false);
  assert.equal(isOffDay(D('2027-01-31'), 'monSat'), true); // Sunday is off in every week
  assert.equal(relativeDays(10, 10), 'today');
  assert.equal(relativeDays(11, 10), 'tomorrow');
  assert.equal(relativeDays(9, 10), 'yesterday');
  assert.equal(relativeDays(50, 10), 'in 40 days');
  assert.equal(relativeDays(3, 10), '7 days ago');
});

test('limits on the notice', () => {
  assert.equal(isValidNotice(0, 'days'), true);
  assert.equal(isValidNotice(365, 'days'), true);
  assert.equal(isValidNotice(366, 'days'), false);
  assert.equal(isValidNotice(12, 'months'), true);
  assert.equal(isValidNotice(13, 'months'), false);
  for (const bad of [-1, 1.5, Number.NaN]) assert.equal(isValidNotice(bad, 'days'), false);
});

test('calendar days: the day after you resign is day one, or the day you resign is', () => {
  // Friday 1 Jan 2027 + 30 days is Sunday 31 Jan; counting the day you resign as day one ends a day earlier.
  assert.equal(last({ resign: '2027-01-01' }), '2027-01-31');
  assert.equal(last({ resign: '2027-01-01', first: 'same' }), '2027-01-30');
  assert.equal(last({ resign: '2027-01-01', notice: 1 }), '2027-01-02');
  assert.equal(last({ resign: '2027-01-01', notice: 1, first: 'same' }), '2027-01-01');
  assert.equal(last({ resign: '2027-03-01', notice: 90 }), '2027-05-30');
  const r = lastWorkingDay(base({ resign: '2027-01-01' }));
  assert.equal(isoDay(r.start), '2027-01-02');
  assert.deepEqual([r.calendarDays, r.weekdays, r.weekendDays, r.moved], [30, 20, 10, null]);
});

test('no notice: the last day is the day you resign', () => {
  for (const first of ['next', 'same'] as FirstDay[]) for (const count of ['calendar', 'monFri', 'monSat'] as CountRule[]) {
    const r = lastWorkingDay(base({ resign: '2027-01-01', notice: 0, first, count }));
    assert.equal(isoDay(r.last), '2027-01-01');
    assert.equal(r.calendarDays, 0);
  }
  assert.match(ruleSentence({ notice: 0, unit: 'days', count: 'calendar', first: 'next' }), /^No notice period/);
});

test('working days skip weekends: 30 working days is six weeks', () => {
  assert.equal(last({ resign: '2027-01-01', count: 'monFri' }), '2027-02-12'); // counting starts Monday 4 Jan
  assert.equal(last({ resign: '2027-01-01', count: 'monSat' }), '2027-02-05'); // Saturdays count, Sundays do not
  assert.equal(last({ resign: '2027-01-01', count: 'monFri', first: 'same' }), '2027-02-11'); // Friday 1 Jan is day one, so it ends on the Thursday
  assert.equal(last({ resign: '2027-01-04', count: 'monFri', notice: 1 }), '2027-01-05');
  assert.equal(last({ resign: '2027-01-08', count: 'monFri', notice: 1 }), '2027-01-11'); // Friday: the next working day is Monday
  for (const day of [D('2027-02-12'), D('2027-02-05')]) assert.equal(isOffDay(day, 'monFri'), false);
});

test('months: the day before the same date next month, and the last day of a short month', () => {
  const m = (resign: string, notice: number, first: FirstDay = 'next') => last({ resign, notice, unit: 'months', first });
  assert.equal(m('2027-01-01', 1), '2027-02-01');
  assert.equal(m('2027-01-01', 1, 'same'), '2027-01-31');
  assert.equal(m('2026-11-15', 3), '2027-02-15');
  assert.equal(m('2026-12-31', 12), '2027-12-31');
  assert.equal(m('2027-01-30', 1), '2027-02-28'); // notice starts the 31st: there is no 31 February
  assert.equal(m('2027-01-30', 1, 'same'), '2027-02-28');
  assert.equal(m('2028-01-30', 1), '2028-02-29'); // a leap year
  assert.equal(m('2028-01-31', 1), '2028-02-29');
  assert.equal(m('2027-03-30', 1), '2027-04-30');
  assert.equal(m('2027-02-27', 1), '2027-03-27');
  assert.equal(m('2027-05-31', 2), '2027-07-31'); // start 1 Jun: 1 Aug minus one day
  assert.equal(m('2027-01-01', 0), '2027-01-01');
  // months ignore the working-day rules: they are counted on the calendar
  assert.equal(last({ resign: '2027-01-01', notice: 1, unit: 'months', count: 'monFri' }), '2027-02-01');
});

test('a weekend last day can be kept or moved to the working day before', () => {
  assert.equal(last({ resign: '2027-01-01' }), '2027-01-31'); // Sunday, kept
  const moved = lastWorkingDay(base({ resign: '2027-01-01', weekend: 'before' }));
  assert.equal(isoDay(moved.last), '2027-01-29');
  assert.equal(isoDay(moved.moved as Day), '2027-01-31');
  assert.equal(moved.calendarDays, 28);
  // a weekday last day is not touched, and neither is a working-day count (it never lands on a weekend)
  assert.equal(lastWorkingDay(base({ resign: '2027-01-04', notice: 10, weekend: 'before' })).moved, null);
  assert.equal(lastWorkingDay(base({ resign: '2027-01-01', count: 'monFri', weekend: 'before' })).moved, null);
  // months too
  assert.equal(last({ resign: '2027-01-30', notice: 1, unit: 'months', weekend: 'before' }), '2027-02-26'); // 28 Feb is a Sunday
  const note = weekendNote(D('2027-01-31'));
  assert.ok(note && /Sunday/.test(note.text) && /Fri 29 Jan/.test(note.text));
  assert.equal(isoDay(note!.before), '2027-01-29');
  assert.match(weekendNote(D('2027-01-30'))!.text, /Saturday/);
  assert.equal(weekendNote(D('2027-01-29')), null);
});

test('the rule is always said back in plain words', () => {
  assert.equal(ruleSentence({ notice: 30, unit: 'days', count: 'calendar', first: 'next' }), '30 days, counted in calendar days, starting the day after you resign.');
  assert.equal(ruleSentence({ notice: 1, unit: 'days', count: 'calendar', first: 'same' }), '1 day, counted in calendar days, counting the day you resign as day one.');
  assert.equal(ruleSentence({ notice: 30, unit: 'days', count: 'monFri', first: 'next' }), '30 working days (Monday to Friday), starting the day after you resign.');
  assert.equal(ruleSentence({ notice: 45, unit: 'days', count: 'monSat', first: 'next' }), '45 working days (Monday to Saturday), starting the day after you resign.');
  assert.equal(ruleSentence({ notice: 3, unit: 'months', count: 'monFri', first: 'next' }), '3 months, counted on the calendar, starting the day after you resign.');
  assert.equal(ruleSentence({ notice: 1, unit: 'months', count: 'calendar', first: 'same' }), '1 month, counted on the calendar, counting the day you resign as day one.');
});

test('reverse: the latest day to resign so you are done the day before the new job starts', () => {
  const rev = (joinOn: string, over: Partial<Omit<NoticeInput, 'resign'>> = {}) => latestResignDate({ joinOn: D(joinOn), notice: 30, unit: 'days', count: 'calendar', first: 'next', weekend: 'keep', ...over });
  const a = rev('2027-03-01')!; // last day Sunday 28 Feb; 30 calendar days back from it
  assert.equal(isoDay(a.resign), '2027-01-29');
  assert.equal(isoDay(a.last), '2027-02-28');
  const b = rev('2027-03-01', { count: 'monFri' })!; // the last day moves back to Friday 26 Feb
  assert.equal(isoDay(b.last), '2027-02-26');
  assert.equal(isoDay(b.resign), '2027-01-17');
  const c = rev('2027-03-01', { weekend: 'before' })!;
  assert.equal(isoDay(c.last), '2027-02-26');
  assert.equal(isoDay(c.resign), '2027-01-29');
  assert.equal(isoDay(rev('2027-03-01', { notice: 0 })!.resign), '2027-02-28');
  assert.equal(isoDay(rev('2027-03-01', { notice: 1, unit: 'months' })!.last), '2027-02-28');
});

test('reverse is exactly the forward rule run backwards, for every rule and many dates', () => {
  const counts: CountRule[] = ['calendar', 'monFri', 'monSat'];
  const units: NoticeUnit[] = ['days', 'months'];
  const firsts: FirstDay[] = ['next', 'same'];
  const weekends: WeekendRule[] = ['keep', 'before'];
  let checked = 0;
  for (let join = D('2026-12-01'); join < D('2027-04-15'); join += 3) {
    for (const unit of units) for (const notice of unit === 'days' ? [0, 1, 7, 30, 45, 60, 90, 180] : [0, 1, 2, 3, 6]) for (const count of counts) for (const first of firsts) for (const weekend of weekends) {
      const r = latestResignDate({ joinOn: join, notice, unit, count, first, weekend });
      assert.ok(r, `${isoDay(join)} ${notice} ${unit}`);
      assert.ok(r.last <= join - 1, 'done before the new job starts');
      // the answer, run forward, gives that last day
      assert.equal(lastWorkingDay({ resign: r.resign, notice, unit, count, first, weekend }).last, r.last);
      // and it is the latest such day: resigning a day later would run past it
      let need = join - 1;
      while (unit === 'days' && count !== 'calendar' ? isOffDay(need, count) : weekend === 'before' && weekday(need) % 6 === 0) need -= 1;
      assert.ok(lastWorkingDay({ resign: r.resign + 1, notice, unit, count, first, weekend }).last > need, `the latest: ${isoDay(join)} ${notice} ${unit} ${count} ${first} ${weekend}`);
      checked += 1;
    }
  }
  assert.ok(checked > 3000, `checked ${checked}`);
});

test('leave at the end: your last day in the office, the official last day does not move', () => {
  assert.deepEqual(lastDayInOffice(D('2027-01-31'), 0, 'calendar', D('2027-01-02')), { day: D('2027-01-31'), coversAll: false });
  const a = lastDayInOffice(D('2027-01-31'), 3, 'calendar', D('2027-01-02')); // Sunday: back over Sat, then Fri, Thu, Wed
  assert.equal(isoDay(a.day), '2027-01-27');
  assert.equal(isoDay(lastDayInOffice(D('2027-02-12'), 5, 'monFri', D('2027-01-02')).day), '2027-02-05');
  assert.equal(isoDay(lastDayInOffice(D('2027-02-13'), 1, 'monSat', D('2027-01-02')).day), '2027-02-12'); // Saturday is a working day in a six-day week
  const all = lastDayInOffice(D('2027-01-29'), 10, 'calendar', D('2027-01-25'));
  assert.equal(all.coversAll, true);
  assert.equal(isoDay(all.day), '2027-01-25');
});

test('leaving sooner: the days short and a buyout estimate', () => {
  assert.equal(shortfall(D('2027-01-31'), D('2027-01-24'), 'calendar', 'days'), 7);
  assert.equal(shortfall(D('2027-02-12'), D('2027-02-05'), 'monFri', 'days'), 5); // working days only
  assert.equal(shortfall(D('2027-02-12'), D('2027-02-05'), 'calendar', 'months'), 7); // months count on the calendar
  assert.equal(shortfall(D('2027-01-31'), D('2027-01-31'), 'calendar', 'days'), 0);
  assert.equal(shortfall(D('2027-01-31'), D('2027-02-10'), 'calendar', 'days'), 0); // staying longer is not a shortfall
  assert.equal(buyoutAmount(10, 50_000, 30), 16_667);
  assert.equal(buyoutAmount(10, 50_000, 26), 19_231);
  assert.equal(buyoutAmount(0, 50_000, 30), 0);
  assert.equal(buyoutAmount(60, 50_000, 30), 100_000);
});

test('the picture: weeks Monday to Sunday with the right days marked', () => {
  const r = lastWorkingDay(base({ resign: '2027-01-01' }));
  const weeks = buildRibbon(r, 'calendar', D('2027-01-10'));
  assert.equal(weeks.length, 5);
  const cells = weeks.flatMap((w) => (w.kind === 'week' ? w.cells : []));
  assert.equal(cells.length, 35);
  assert.equal(isoDay(cells[0].day), '2026-12-28'); // a Monday
  assert.equal(weekday(cells[0].day), 1);
  assert.equal(cells.filter((c) => c.inNotice).length, 30);
  assert.equal(cells.filter((c) => c.inNotice && c.off).length, 10); // ten weekend days inside the notice
  assert.deepEqual(cells.filter((c) => c.resign).map((c) => isoDay(c.day)), ['2027-01-01']);
  assert.deepEqual(cells.filter((c) => c.last).map((c) => isoDay(c.day)), ['2027-01-31']);
  assert.deepEqual(cells.filter((c) => c.today).map((c) => isoDay(c.day)), ['2027-01-10']);
  assert.equal(cells.find((c) => c.resign)!.inNotice, false); // the day after is day one
  const first = weeks[0];
  assert.ok(first.kind === 'week' && first.label === 'Jan');
  // counting the day you resign as day one puts it inside the notice
  const same = buildRibbon(lastWorkingDay(base({ resign: '2027-01-01', first: 'same' })), 'calendar', null).flatMap((w) => (w.kind === 'week' ? w.cells : []));
  assert.equal(same.find((c) => c.resign)!.inNotice, true);
  assert.equal(same.filter((c) => c.today).length, 0);
  // a six-day week marks only Sundays
  const six = buildRibbon(lastWorkingDay(base({ resign: '2027-01-01', count: 'monSat' })), 'monSat', null).flatMap((w) => (w.kind === 'week' ? w.cells : []));
  assert.ok(six.filter((c) => c.inNotice && c.off).every((c) => weekday(c.day) === 0));
  // no notice: nothing is shaded
  assert.equal(buildRibbon(lastWorkingDay(base({ resign: '2027-01-01', notice: 0 })), 'calendar', null).flatMap((w) => (w.kind === 'week' ? w.cells : [])).filter((c) => c.inNotice).length, 0);
});

test('a very long notice shows its first and last weeks and says how many are between', () => {
  const r = lastWorkingDay(base({ resign: '2027-01-04', notice: 365 }));
  const weeks = buildRibbon(r, 'calendar', null);
  const gaps = weeks.filter((w) => w.kind === 'gap');
  assert.equal(weeks.length, 17);
  assert.equal(gaps.length, 1);
  const full = Math.floor((r.last - 0) / 7) - Math.floor((r.resign - 0) / 7) + 1; // rows if nothing were hidden (both ends on Monday-aligned weeks)
  assert.ok(Math.abs((gaps[0] as { weeks: number }).weeks - (full - 16)) <= 1);
  assert.ok(weeks[8].kind === 'gap');
  const short = buildRibbon(lastWorkingDay(base({ resign: '2027-01-04', notice: 120 })), 'calendar', null);
  assert.equal(short.filter((w) => w.kind === 'gap').length, 0);
});

test('the calendar file: an all-day event on the last working day', () => {
  const ics = lastDayIcs(D('2027-01-31'), '20261114T100000Z', '30 days, from Fri 1 Jan; worked out on KaamSolv');
  const lines = ics.split('\r\n');
  assert.equal(lines[0], 'BEGIN:VCALENDAR');
  assert.equal(lines.at(-1), '');
  assert.equal(lines.at(-2), 'END:VCALENDAR');
  assert.ok(lines.includes('DTSTART;VALUE=DATE:20270131'));
  assert.ok(lines.includes('DTEND;VALUE=DATE:20270201'));
  assert.ok(lines.includes('SUMMARY:Last working day'));
  assert.ok(lines.includes('DTSTAMP:20261114T100000Z'));
  assert.ok(lines.includes('UID:last-working-day-2027-01-31@kaamsolv.com'));
  assert.ok(lines.includes('DESCRIPTION:30 days\\, from Fri 1 Jan\\; worked out on KaamSolv'));
  assert.equal(ics.includes('\n\n'), false);
  // a month end rolls into the next month correctly
  assert.ok(lastDayIcs(D('2027-12-31'), '20261114T100000Z', 'x').includes('DTEND;VALUE=DATE:20280101'));
});
