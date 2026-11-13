'use client';

import { useState } from 'react';
import { Answer, CARD, FIELD, NumberField, Row } from './everyday-calculators';
import { Chips, Segmented } from '../choice';
import { CompareChart } from './compare-calculator';
import { shortRupees } from './growth-chart';
import { useInfo } from './info-tip';
import { count, Frame, Note, Problem, Tenure } from './interest-calculators';
import { ModeToggle, Nudges, ResultActions, useSharedValues, type CalcMode, type Nudge } from './result-extras';
import { SliderField } from './slider-field';
import { emi, emiPrepay, gst, GST_PRESET_RATES, GST_RATES_CHECKED, loanForEmi, type EmiRow, type EmiYear, type GstMode } from '@/app/lib/calc/finance';
import { writeShare } from '@/app/lib/calc/share-state';
import { formatNumber, formatRupees, parseAmount } from '@/app/lib/calc/everyday';

// ------------------------------------------------------------------------- GST

export function GstCalculator() {
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<GstMode>('add');
  const [rate, setRate] = useState('18');
  const [custom, setCustom] = useState(false);

  const rateN = parseAmount(rate);
  const r = gst(parseAmount(amount), rateN, mode);
  const rateLabel = Number.isFinite(rateN) ? `${formatNumber(rateN)}%` : '';

  return (
    <div className={`mx-auto max-w-2xl space-y-5 ${CARD}`}>
      <Segmented
        legend="Add or remove GST"
        hideLegend
        options={[
          { value: 'add' as GstMode, label: 'Add GST' },
          { value: 'remove' as GstMode, label: 'Remove GST' },
        ]}
        value={mode}
        onChange={setMode}
      />

      <NumberField
        id="gst-amount"
        label={mode === 'add' ? 'Price before GST' : 'Price including GST'}
        value={amount}
        onChange={setAmount}
        prefix="₹"
        placeholder="1,000"
      />

      <div>
        <Chips
          legend="GST rate"
          options={[
            ...GST_PRESET_RATES.map((p) => ({ value: String(p), label: `${p}%` })),
            { value: 'custom', label: 'Custom' },
          ]}
          value={custom ? 'custom' : rate}
          onChange={(v) => {
            if (v === 'custom') {
              setCustom(true);
              return;
            }
            setCustom(false);
            setRate(v);
          }}
        />
        {custom && (
          <div className="relative mt-2 w-32">
            <input
              aria-label="Custom GST rate in percent"
              inputMode="decimal"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              className={`${FIELD} pr-8`}
              autoFocus
            />
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-base font-semibold text-muted">%</span>
          </div>
        )}
        <p className="mt-1.5 text-xs text-muted">
          Main rates since 22 Sept 2025: 5% and 18%, with 40% for a few items like tobacco and luxury cars. Use Custom
          for anything else.
        </p>
      </div>

      <Answer
        label={mode === 'add' ? `Price with ${rateLabel} GST` : `Price before ${rateLabel} GST`}
        value={r ? formatRupees(mode === 'add' ? r.total : r.base) : null}
        copy={r ? String(mode === 'add' ? r.total : r.base) : undefined}
      />

      {r && (
        <>
          <dl>
            <Row label="Price before GST" value={formatRupees(r.base)} />
            <Row label={`GST (${rateLabel})`} value={formatRupees(r.gst)} />
            <Row label="Price with GST" value={formatRupees(r.total)} />
          </dl>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-hair p-4">
              <p className="text-sm font-semibold text-ink">Within a state</p>
              <dl className="mt-1">
                <Row label={`CGST (${formatNumber(rateN / 2)}%)`} value={formatRupees(r.cgst)} />
                <Row label={`SGST / UTGST (${formatNumber(rateN / 2)}%)`} value={formatRupees(r.sgst)} />
              </dl>
            </div>
            <div className="rounded-xl border border-hair p-4">
              <p className="text-sm font-semibold text-ink">Between states</p>
              <dl className="mt-1">
                <Row label={`IGST (${rateLabel})`} value={formatRupees(r.igst)} />
              </dl>
            </div>
          </div>
        </>
      )}
      <p className="text-xs text-muted">
        Rates checked {GST_RATES_CHECKED}. This is an estimate, not tax advice — check the rate for your item with your
        accountant or the official GST notifications.
      </p>
    </div>
  );
}

// ------------------------------------------------------------------------- EMI

const EMI_HELP = {
  amount: 'The amount you borrow from the lender, also called the principal. Interest is charged on what you still owe each month.',
  budget: 'The most you want to pay every month as an EMI. The calculator works out the biggest loan that fits it.',
  rate: 'The yearly interest rate on the loan, from your sanction letter or the lender. For a floating-rate loan it can change over time; this calculator uses one rate for the whole loan.',
  tenure: 'How long you take to repay, in years and months. A longer tenure gives a smaller EMI but costs much more interest overall.',
  extra: 'An extra amount you add to every EMI, on top of the normal one. It goes straight to the principal, so the loan ends sooner and costs less interest.',
  lump: 'A one-time part-payment, such as a bonus, paid towards the loan. Leave it at 0 if you are not planning one.',
  lumpMonth: 'The month, counted from the first EMI, after which you pay the lump sum. For example 24 means after your 24th EMI.',
  outcome: 'After a lump sum you can usually ask the lender for one of two things. Finish sooner: keep the same EMI and the loan ends earlier, which saves the most interest. Lower my EMI: keep the same end date and pay a smaller EMI, which eases your monthly budget. Ask your lender which one it applies, and whether it charges for part-payments.',
} as const;

const money = (n: number) => formatRupees(n);
const monthsText = (n: number) => {
  const y = Math.floor(n / 12);
  const m = n % 12;
  return [y ? `${y} ${y === 1 ? 'year' : 'years'}` : '', m ? `${m} ${m === 1 ? 'month' : 'months'}` : ''].filter(Boolean).join(' ') || '0 months';
};
const groupN = (n: number) => Math.round(n).toLocaleString('en-IN');

function Outcome({ title, lines, testId }: { title: string; lines: [string, string][]; testId: string }) {
  return (
    <div className="rounded-xl border border-hair p-4" data-testid={testId}>
      <p className="text-sm font-semibold text-ink">{title}</p>
      <dl className="mt-1">
        {lines.map(([label, value]) => (
          <Row key={label} label={label} value={value} />
        ))}
      </dl>
    </div>
  );
}

export function EmiCalculator() {
  const [mode, setMode] = useState<CalcMode>('value');
  const [amount, setAmount] = useState('50,00,000');
  const [budget, setBudget] = useState('50,000');
  const [rate, setRate] = useState('9');
  const [years, setYears] = useState('20');
  const [monthsBox, setMonthsBox] = useState('0');
  const [prepayOpen, setPrepayOpen] = useState(false);
  const [extra, setExtra] = useState('0');
  const [lump, setLump] = useState('0');
  const [lumpMonth, setLumpMonth] = useState('24');
  const outcomeInfo = useInfo(EMI_HELP.outcome);

  useSharedValues((v) => {
    if (v.e !== undefined) {
      setMode('goal');
      setBudget(groupN(v.e));
    }
    if (v.a !== undefined) setAmount(groupN(v.a));
    if (v.r !== undefined) setRate(String(v.r));
    if (v.y !== undefined) setYears(String(v.y));
    if (v.m !== undefined) setMonthsBox(String(v.m));
    if (v.x !== undefined) setExtra(groupN(v.x));
    if (v.p !== undefined) setLump(groupN(v.p));
    if (v.n !== undefined) setLumpMonth(String(v.n));
    if (v.x !== undefined || v.p !== undefined) setPrepayOpen(true);
  });

  const months = count(years) * 12 + count(monthsBox);
  const rateN = parseAmount(rate);
  const afford = mode === 'goal';
  const budgetN = parseAmount(budget);
  const filled = (afford ? budget.trim() : amount.trim()) !== '' && rate.trim() !== '' && (years.trim() !== '' || monthsBox.trim() !== '');
  const principal = !filled ? null : afford ? loanForEmi(budgetN, rateN, months) : parseAmount(amount);
  const r = principal !== null && Number.isFinite(principal) ? emi(principal, rateN, months) : null;
  const principalShare = r && principal ? Math.round((principal / r.totalPayment) * 100) : 0;

  const extraN = extra.trim() === '' ? 0 : parseAmount(extra);
  const lumpN = lump.trim() === '' ? 0 : parseAmount(lump);
  const lumpMonthN = lumpMonth.trim() === '' ? 0 : parseAmount(lumpMonth);
  const hasPrepay = extraN > 0 || lumpN > 0;
  const prepayInput = r && principal ? { principal, annualRatePercent: rateN, months, extraMonthly: extraN, lumpAmount: lumpN, lumpAfterMonth: lumpMonthN } : null;
  const shorter = prepayInput && hasPrepay ? emiPrepay({ ...prepayInput, lumpMode: 'shorter' }) : null;
  const lower = prepayInput && lumpN > 0 ? emiPrepay({ ...prepayInput, lumpMode: 'lower' }) : null;
  const prepayBad = hasPrepay && r !== null && shorter === null;

  const baseRows = r ? r.byYear.map((y) => ({ year: y.year, invested: 0, balance: y.balance, interest: 0 })) : [];
  const withRows = shorter ? shorter.balanceByYear.map((y) => ({ year: y.year, invested: 0, balance: y.balance, interest: 0 })) : [];

  const nudges: Nudge[] = [];
  if (r && principal) {
    if (!afford && months > 60) {
      const shortened = emi(principal, rateN, months - 60);
      if (shortened && r.totalInterest - shortened.totalInterest >= 1)
        nudges.push({
          text: `${monthsText(months - 60)} instead → save ${shortRupees(r.totalInterest - shortened.totalInterest)} interest, EMI becomes ${money(shortened.emi)}`,
          apply: () => {
            const m = months - 60;
            setYears(String(Math.floor(m / 12)));
            setMonthsBox(String(m % 12));
          },
        });
    }
    if (rateN >= 0.5) {
      const cheaper = emi(principal, rateN - 0.5, months);
      if (cheaper && r.totalInterest - cheaper.totalInterest >= 1)
        nudges.push({ text: `A rate 0.5% lower → save ${shortRupees(r.totalInterest - cheaper.totalInterest)} interest`, apply: () => setRate(String(Math.round((rateN - 0.5) * 100) / 100)) });
    }
    if (!hasPrepay || extraN === 0) {
      const withExtra = emiPrepay({ principal, annualRatePercent: rateN, months, extraMonthly: 5000 });
      if (withExtra && withExtra.interestSaved >= 1)
        nudges.push({
          text: `Add ₹5,000 to every EMI → finish ${monthsText(withExtra.monthsSaved)} sooner and save ${shortRupees(withExtra.interestSaved)}`,
          apply: () => {
            setExtra('5,000');
            setPrepayOpen(true);
          },
        });
    }
  }

  const prepayLine = shorter
    ? ` With ${extraN > 0 ? `${money(extraN)} extra every month` : ''}${extraN > 0 && lumpN > 0 ? ' and ' : ''}${lumpN > 0 ? `${money(lumpN)} paid after month ${lumpMonthN}` : ''} the loan ends in ${monthsText(shorter.months)} and saves ${money(shorter.interestSaved)} interest.`
    : '';
  const summary = r && principal
    ? `${afford ? `An EMI of ${money(budgetN)} a month at ${formatNumber(rateN)}% for ${monthsText(months)} supports a loan of about ${money(principal)}. ` : ''}Loan ${money(principal)} at ${formatNumber(rateN)}% a year for ${monthsText(months)}: EMI ${money(r.emi)}, total interest ${money(r.totalInterest)}, total paid ${money(r.totalPayment)}.${prepayLine} An estimate; your lender may differ.`
    : undefined;
  const query = writeShare({
    [afford ? 'e' : 'a']: afford ? budgetN : (principal ?? undefined),
    r: rateN,
    y: count(years),
    m: count(monthsBox) || undefined,
    x: extraN > 0 ? extraN : undefined,
    p: lumpN > 0 ? lumpN : undefined,
    n: lumpN > 0 ? lumpMonthN : undefined,
  });
  const lumpMax = Math.max(2, months - 1);

  return (
    <Frame
      stickyLabel={afford ? 'You can borrow' : 'Monthly EMI'}
      stickyValue={r && principal ? shortRupees(afford ? principal : r.emi) : null}
      inputs={
        <>
          <ModeToggle mode={mode} onChange={setMode} goalLabel="How much can I borrow?" valueLabel="Find my EMI" />
          {afford ? (
            <SliderField id="emi-budget" label="EMI I can pay each month" value={budget} onChange={setBudget} min={5000} max={500000} step={1000} prefix="₹" minLabel="₹5,000" maxLabel="₹5,00,000" group info={EMI_HELP.budget} />
          ) : (
            <SliderField id="emi-amount" label="Loan amount" value={amount} onChange={setAmount} min={100000} max={50000000} step={100000} prefix="₹" minLabel="₹1 lakh" maxLabel="₹5 crore" group info={EMI_HELP.amount} />
          )}
          <SliderField id="emi-rate" label="Interest rate (yearly)" value={rate} onChange={setRate} min={1} max={20} step={0.1} suffix="%" minLabel="1%" maxLabel="20%" info={EMI_HELP.rate} />
          <Tenure idPrefix="emi" years={years} months={monthsBox} setYears={setYears} setMonths={setMonthsBox} maxYears={40} label="Loan tenure" yearsInfo={EMI_HELP.tenure} monthsInfo="Extra months on top of the years." />
          {!afford && (
            <details className="rounded-xl border border-hair px-3 py-2" open={prepayOpen} onToggle={(e) => setPrepayOpen(e.currentTarget.open)} data-testid="prepay-section">
              <summary className="min-h-10 pointer-coarse:min-h-11 cursor-pointer py-1.5 text-sm font-semibold text-ink">Add a prepayment (optional)</summary>
              <div className="space-y-5 pb-2 pt-3">
                <SliderField id="emi-extra" label="Extra on every EMI" value={extra} onChange={setExtra} min={0} max={200000} step={1000} prefix="₹" minLabel="₹0" maxLabel="₹2,00,000" group info={EMI_HELP.extra} />
                <SliderField id="emi-lump" label="One lump sum" value={lump} onChange={setLump} min={0} max={20000000} step={100000} prefix="₹" minLabel="₹0" maxLabel="₹2 crore" group info={EMI_HELP.lump} />
                {lumpN > 0 && <SliderField id="emi-lump-month" label="Lump sum paid after month" value={lumpMonth} onChange={setLumpMonth} min={1} max={lumpMax} step={1} minLabel="Month 1" maxLabel={`Month ${lumpMax}`} info={EMI_HELP.lumpMonth} />}
              </div>
            </details>
          )}
          {filled && !r && <Problem>Check the numbers: {afford ? 'an EMI that gives a loan' : 'loan'} up to ₹100 crore, interest 0–50% a year, tenure 1 month to 40 years.</Problem>}
          {prepayBad && <Problem>Check the prepayment: the lump sum needs a month between 1 and {months - 1}, and amounts must be zero or more.</Problem>}
        </>
      }
      results={
        <>
          <Answer label={afford ? 'You can borrow about' : 'Monthly EMI'} value={r && principal ? money(afford ? principal : r.emi) : null} copy={summary} />
          {r && principal && (
            <>
              <p className="-mt-3 text-sm text-muted" data-testid="short-amount">
                {afford ? `With an EMI of ${money(r.emi)} for ${monthsText(months)}` : `${shortRupees(r.emi)} a month for ${monthsText(months)}`}
              </p>
              <dl>
                {afford && <Row label="Your EMI" value={money(r.emi)} />}
                <Row label="Principal" value={money(principal)} />
                <Row label="Total interest" value={money(r.totalInterest)} />
                <Row label={`Total paid over ${formatNumber(r.months)} months`} value={money(r.totalPayment)} />
              </dl>
              <div>
                <div className="flex h-3 overflow-hidden rounded-full" aria-hidden="true">
                  <div className="bg-teal-500" style={{ width: `${principalShare}%` }} />
                  <div className="bg-coral-500" style={{ width: `${100 - principalShare}%` }} />
                </div>
                <p className="mt-1.5 flex flex-wrap gap-x-4 text-xs text-muted">
                  <span>
                    <span className="mr-1 inline-block h-2 w-2 rounded-full bg-teal-500" aria-hidden="true" />
                    Principal {principalShare}%
                  </span>
                  <span>
                    <span className="mr-1 inline-block h-2 w-2 rounded-full bg-coral-500" aria-hidden="true" />
                    Interest {100 - principalShare}%
                  </span>
                </p>
              </div>

              {shorter && (
                <section aria-labelledby="prepay-title" className="space-y-3" data-testid="prepay-result">
                  <div className="flex items-center gap-2">
                    <h3 id="prepay-title" className="text-sm font-bold text-ink">
                      {lumpN > 0 ? 'What your prepayment does' : 'What your extra payment does'}
                    </h3>
                    {lumpN > 0 && outcomeInfo.button}
                  </div>
                  {lumpN > 0 && outcomeInfo.note}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Outcome
                      testId="outcome-shorter"
                      title={lumpN > 0 ? 'Finish sooner' : 'With your extra payment'}
                      lines={[
                        ['Loan ends in', monthsText(shorter.months)],
                        ['Sooner by', monthsText(shorter.monthsSaved)],
                        ['EMI', money(shorter.newEmi)],
                        ['Interest saved', money(shorter.interestSaved)],
                      ]}
                    />
                    {lower && (
                      <Outcome
                        testId="outcome-lower"
                        title="Lower my EMI"
                        lines={[
                          ['Loan ends in', monthsText(lower.months)],
                          [`EMI after month ${lumpMonthN}`, money(lower.newEmi)],
                          ['EMI drops by', money(lower.emi - lower.newEmi)],
                          ['Interest saved', money(lower.interestSaved)],
                        ]}
                      />
                    )}
                  </div>
                  <CompareChart
                    a={{ name: 'No prepayment', colorVar: '--color-coral-500', rows: baseRows, start: principal, invested: principal, value: 0 }}
                    b={{ name: 'With prepayment', colorVar: '--color-teal-500', dash: '6 4', rows: withRows, start: principal, invested: principal, value: 0 }}
                    title={`Outstanding loan balance by year, with and without your prepayment: the loan ends in ${monthsText(shorter.months)} instead of ${monthsText(months)}.`}
                  />
                  {lower && <p className="text-xs text-muted">The chart shows the finish-sooner case.</p>}
                </section>
              )}

              <Nudges items={nudges} />
              {summary && <ResultActions message={summary} query={query} path="/emi-calculator" />}
            </>
          )}
          <Note>
            Standard monthly reducing-balance method most Indian banks use: EMI = P × r × (1 + r)ⁿ ÷ ((1 + r)ⁿ − 1). A prepayment is taken off the balance right after the month you choose. Your lender&apos;s figure may differ slightly with fees,
            insurance, a different start date, daily interest or a rate that changes. Ask your lender whether it charges for part-payments. An estimate, not advice.
          </Note>
          <p className="hidden print:block" data-testid="print-summary">
            {summary} kaamsolv.com/emi-calculator
          </p>
        </>
      }
      after={
        r ? (
          <ScheduleCard schedule={r.schedule} byYear={r.byYear} />
        ) : null
      }
    />
  );
}

function ScheduleCard({ schedule, byYear }: { schedule: EmiRow[]; byYear: EmiYear[] }) {
  const [monthly, setMonthly] = useState(false);
  return (
    <section aria-labelledby="schedule-title" className={CARD}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="schedule-title" className="font-display text-lg font-bold text-ink">
          Repayment schedule <span className="text-sm font-normal text-muted">(without prepayment)</span>
        </h2>
        <Segmented
          legend="Show the schedule"
          hideLegend
          options={[
            { value: false, label: 'By year' },
            { value: true, label: 'By month' },
          ]}
          value={monthly}
          onChange={setMonthly}
        />
      </div>
      <div className="mt-4 max-h-[28rem] overflow-auto rounded-lg border border-hair">
        <table className="w-full min-w-[26rem] text-right text-sm">
          <thead className="sticky top-0 bg-surface text-xs text-muted">
            <tr className="border-b border-hair">
              <th scope="col" className="px-3 py-2 text-left font-semibold">{monthly ? 'Month' : 'Year'}</th>
              <th scope="col" className="px-3 py-2 font-semibold">Principal</th>
              <th scope="col" className="px-3 py-2 font-semibold">Interest</th>
              <th scope="col" className="px-3 py-2 font-semibold">Balance</th>
            </tr>
          </thead>
          <tbody className="tabular-nums text-strong">
            {(monthly ? schedule.map((x) => ({ key: x.month, ...x })) : byYear.map((x) => ({ key: x.year, ...x }))).map((row) => (
              <tr key={row.key} className="border-b border-hair last:border-0">
                <th scope="row" className="px-3 py-2 text-left font-semibold text-ink">{row.key}</th>
                <td className="px-3 py-2">{formatRupees(row.principal)}</td>
                <td className="px-3 py-2">{formatRupees(row.interest)}</td>
                <td className="px-3 py-2">{formatRupees(row.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
