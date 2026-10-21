'use client';

import { useEffect, useState } from 'react';
import { CopyButton } from '../copy-button';
import {
  ageOn,
  discount,
  formatNumber,
  formatRupees,
  parseAmount,
  parseDateInput,
  percentChange,
  percentOf,
  splitBill,
  whatPercent,
} from '@/app/lib/calc/everyday';

const FIELD =
  'h-12 w-full rounded-xl border border-hair bg-fieldbg px-4 text-base font-semibold text-ink placeholder:font-normal placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500';
const PILL = (active: boolean) =>
  `h-9 rounded-full px-3.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 ${
    active ? 'bg-navy-900 text-white' : 'border border-hair bg-fieldbg text-strong hover:bg-wash'
  }`;
const CARD = 'rounded-xl2 border border-hair bg-surface p-5 sm:p-6';

function NumberField({
  id,
  label,
  value,
  onChange,
  prefix,
  suffix,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  prefix?: string;
  suffix?: string;
  placeholder?: string;
}) {
  const invalid = value.trim() !== '' && Number.isNaN(parseAmount(value));
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-ink">
        {label}
      </label>
      <div className="relative">
        {prefix && (
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-base font-semibold text-muted">
            {prefix}
          </span>
        )}
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? `${id}-err` : undefined}
          className={`${FIELD} ${prefix ? 'pl-9' : ''} ${suffix ? 'pr-10' : ''}`}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-base font-semibold text-muted">
            {suffix}
          </span>
        )}
      </div>
      {invalid && (
        <p id={`${id}-err`} className="mt-1 text-xs font-medium text-danger-700">
          Enter a number, like 2500 or 12.5.
        </p>
      )}
    </div>
  );
}

/** The answer line, with copy. Empty until inputs are valid. */
function Answer({ label, value, copy }: { label: string; value: string | null; copy?: string }) {
  return (
    <div className="rounded-xl border border-teal-300 bg-tealx-100 px-5 py-4" aria-live="polite">
      <p className="text-sm font-medium text-strong">{label}</p>
      <div className="mt-1 flex items-center justify-between gap-3">
        <p className="font-display text-3xl font-extrabold text-ink">{value ?? '—'}</p>
        {value && <CopyButton value={copy ?? value} />}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-hair py-2 text-sm last:border-0">
      <dt className="text-muted">{label}</dt>
      <dd className="font-semibold text-ink">{value}</dd>
    </div>
  );
}

const num = (s: string) => parseAmount(s);
const pct = (n: number | null) => (n === null ? null : `${formatNumber(n)}%`);

// ------------------------------------------------------------------ Percentage

type PercentMode = 'of' | 'what' | 'change';

export function PercentageCalculator() {
  const [mode, setMode] = useState<PercentMode>('of');
  const [a, setA] = useState('');
  const [b, setB] = useState('');

  const modes: { id: PercentMode; label: string }[] = [
    { id: 'of', label: 'X% of Y' },
    { id: 'what', label: 'X is what % of Y' },
    { id: 'change', label: '% increase / decrease' },
  ];

  let answer: string | null = null;
  let answerLabel = '';
  let fields: [string, string, string?, string?] = ['', ''];
  if (mode === 'of') {
    const r = percentOf(num(a), num(b));
    answer = r === null ? null : formatNumber(r);
    answerLabel = a && b ? `${a}% of ${b} is` : 'Answer';
    fields = ['Percentage', 'Of', '%'];
  } else if (mode === 'what') {
    answer = pct(whatPercent(num(a), num(b)));
    answerLabel = a && b ? `${a} out of ${b} is` : 'Answer';
    fields = ['Value', 'Out of'];
  } else {
    const r = percentChange(num(a), num(b));
    answer = r === null ? null : `${r > 0 ? '+' : ''}${formatNumber(r)}%`;
    answerLabel = r === null ? 'Change' : r > 0 ? 'Increase' : r < 0 ? 'Decrease' : 'No change';
    fields = ['From', 'To'];
  }

  return (
    <div className={`mx-auto max-w-2xl space-y-5 ${CARD}`}>
      <div className="flex flex-wrap gap-2" role="group" aria-label="What do you want to work out?">
        {modes.map((m) => (
          <button key={m.id} type="button" aria-pressed={mode === m.id} onClick={() => setMode(m.id)} className={PILL(mode === m.id)}>
            {m.label}
          </button>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField id="pc-a" label={fields[0]} value={a} onChange={setA} suffix={fields[2]} placeholder="e.g. 18" />
        <NumberField id="pc-b" label={fields[1]} value={b} onChange={setB} placeholder="e.g. 2500" />
      </div>
      <Answer label={answerLabel} value={answer} copy={answer?.replace(/[+%]/g, '')} />
      {mode === 'change' && num(a) === 0 && b && (
        <p className="text-sm text-muted">A change from 0 can’t be shown as a percentage.</p>
      )}
    </div>
  );
}

// -------------------------------------------------------------------- Discount

export function DiscountCalculator() {
  const [price, setPrice] = useState('');
  const [off, setOff] = useState('');
  const [extra, setExtra] = useState('');
  const extraN = extra.trim() === '' ? 0 : num(extra);
  const r = discount(num(price), num(off), extraN);
  const outOfRange = off !== '' && r === null && !Number.isNaN(num(off)) && !Number.isNaN(num(price));

  return (
    <div className={`mx-auto max-w-2xl space-y-5 ${CARD}`}>
      <div className="grid gap-4 sm:grid-cols-3">
        <NumberField id="dc-price" label="Price" value={price} onChange={setPrice} prefix="₹" placeholder="2,499" />
        <NumberField id="dc-off" label="Discount" value={off} onChange={setOff} suffix="%" placeholder="20" />
        <NumberField id="dc-extra" label="Extra discount (optional)" value={extra} onChange={setExtra} suffix="%" placeholder="0" />
      </div>
      {outOfRange && <p className="text-sm font-medium text-danger-700">Discounts must be between 0% and 100%.</p>}
      <Answer label="You pay" value={r ? formatRupees(r.final) : null} copy={r ? String(r.final) : undefined} />
      {r && (
        <dl>
          <Row label="You save" value={formatRupees(r.saved)} />
          <Row label="Total discount" value={pct(whatPercent(r.saved, num(price))) ?? '—'} />
        </dl>
      )}
      {extraN > 0 && r && (
        <p className="text-xs text-muted">
          An extra discount comes off the already-reduced price, so {off}% + {extra}% is less than {formatNumber(num(off) + extraN)}% off.
        </p>
      )}
    </div>
  );
}

// ------------------------------------------------------- Tip / Split the bill

export function TipSplitCalculator({ defaultTip }: { defaultTip: number }) {
  const [bill, setBill] = useState('');
  const [tip, setTip] = useState(String(defaultTip));
  const [people, setPeople] = useState('2');
  const peopleN = Math.round(num(people));
  const r = splitBill(num(bill), num(tip), peopleN);
  const presets = [0, 5, 10, 15, 20];

  return (
    <div className={`mx-auto max-w-2xl space-y-5 ${CARD}`}>
      <NumberField id="tb-bill" label="Bill amount" value={bill} onChange={setBill} prefix="₹" placeholder="1,850" />
      <div>
        <NumberField id="tb-tip" label="Tip" value={tip} onChange={setTip} suffix="%" />
        <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Quick tip">
          {presets.map((p) => (
            <button key={p} type="button" aria-pressed={num(tip) === p} onClick={() => setTip(String(p))} className={PILL(num(tip) === p)}>
              {p === 0 ? 'No tip' : `${p}%`}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1.5 text-sm font-semibold text-ink" id="tb-people-label">
          People
        </p>
        <div className="flex items-center gap-2" role="group" aria-labelledby="tb-people-label">
          <button
            type="button"
            aria-label="One fewer person"
            onClick={() => setPeople((p) => String(Math.max(1, (Math.round(parseAmount(p)) || 1) - 1)))}
            className="grid h-12 w-12 place-items-center rounded-xl border border-hair bg-fieldbg text-xl font-bold text-ink hover:bg-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500"
          >
            −
          </button>
          <input
            aria-label="Number of people"
            inputMode="numeric"
            value={people}
            onChange={(e) => setPeople(e.target.value.replace(/\D/g, ''))}
            className={`${FIELD} w-24 text-center`}
          />
          <button
            type="button"
            aria-label="One more person"
            onClick={() => setPeople((p) => String(Math.min(1000, (Math.round(parseAmount(p)) || 0) + 1)))}
            className="grid h-12 w-12 place-items-center rounded-xl border border-hair bg-fieldbg text-xl font-bold text-ink hover:bg-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500"
          >
            +
          </button>
        </div>
      </div>
      <Answer
        label={peopleN > 1 ? 'Each person pays' : 'Total to pay'}
        value={r ? formatRupees(peopleN > 1 ? r.perPerson : r.total) : null}
        copy={r ? String(peopleN > 1 ? r.perPerson : r.total) : undefined}
      />
      {r && (
        <dl>
          <Row label="Tip" value={formatRupees(r.tip)} />
          <Row label="Total with tip" value={formatRupees(r.total)} />
          {peopleN > 1 && r.perPersonRoundedUp !== r.perPerson && (
            <Row label="Each, rounded up" value={`₹${formatNumber(r.perPersonRoundedUp)}`} />
          )}
        </dl>
      )}
    </div>
  );
}

// ------------------------------------------------------------------------- Age

const todayIso = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

export function AgeCalculator() {
  const [birth, setBirth] = useState('');
  const [on, setOn] = useState('');
  // Today comes from the visitor's own clock, after hydration.
  useEffect(() => setOn(todayIso()), []);

  const b = parseDateInput(birth);
  const o = parseDateInput(on);
  const r = b && o ? ageOn(b, o) : null;
  const future = b && o && !r;
  const plural = (n: number, w: string) => `${formatNumber(n)} ${w}${n === 1 ? '' : 's'}`;
  const answer = r ? `${plural(r.years, 'year')}, ${plural(r.months, 'month')}, ${plural(r.days, 'day')}` : null;

  return (
    <div className={`mx-auto max-w-2xl space-y-5 ${CARD}`}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="age-birth" className="mb-1.5 block text-sm font-semibold text-ink">
            Date of birth
          </label>
          <input id="age-birth" type="date" value={birth} max={on || undefined} onChange={(e) => setBirth(e.target.value)} className={FIELD} />
        </div>
        <div>
          <label htmlFor="age-on" className="mb-1.5 block text-sm font-semibold text-ink">
            Age on
          </label>
          <input id="age-on" type="date" value={on} onChange={(e) => setOn(e.target.value)} className={FIELD} />
        </div>
      </div>
      {future && <p className="text-sm font-medium text-danger-700">The date of birth is after the “Age on” date.</p>}
      <Answer label="Age" value={answer} />
      {r && (
        <dl>
          <Row
            label="Next birthday"
            value={r.daysToNextBirthday === 0 ? 'Today — happy birthday! 🎉' : `In ${plural(r.daysToNextBirthday, 'day')} (turns ${r.nextBirthdayAge})`}
          />
          <Row label="Born on a" value={r.bornWeekday} />
          <Row label="Total months" value={formatNumber(r.totalMonths)} />
          <Row label="Total weeks" value={formatNumber(r.totalWeeks)} />
          <Row label="Total days" value={formatNumber(r.totalDays)} />
        </dl>
      )}
    </div>
  );
}
