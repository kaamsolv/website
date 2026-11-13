'use client';

import { useState } from 'react';
import { Answer, Row } from './everyday-calculators';
import { shortRupees } from './growth-chart';
import { InfoHeading } from './info-tip';
import { Frame, Note, Problem } from './interest-calculators';
import { PrintAction } from './result-extras';
import { SliderField } from './slider-field';
import { Chips, Segmented } from '../choice';
import {
  HRA_CITIES,
  HRA_RULES_CHECKED,
  hra,
  regimeCheck,
  rentForMaxExemption,
  cityPercent,
  type HraCity,
  type HraLimit,
  type HraYear,
} from '@/app/lib/calc/hra';
import { formatRupees, parseAmount } from '@/app/lib/calc/everyday';

type Period = 'monthly' | 'yearly';

const HELP = {
  basic: 'Basic pay is the fixed core of your salary, shown on your payslip. Enter it for the same period (monthly or yearly) as the other amounts.',
  da: 'Dearness allowance counts here only if your terms of employment say it forms part of your pay. If you are not sure, leave it at 0 or ask your payroll team.',
  hra: 'The House Rent Allowance your employer pays you, as shown on your payslip.',
  rent: 'The rent you actually pay for the home you live in. It has to be rent you really pay: if you own the home you live in, or pay no rent, there is no exemption.',
  city: 'The city you live in. From FY 2026-27 eight cities get the 50% limit: Delhi, Mumbai, Kolkata, Chennai, Bengaluru, Hyderabad, Pune and Ahmedabad. Every other place is 40%. Before that, only the first four got 50%.',
  year: 'The financial year you are claiming for. The list of 50% cities changed from FY 2026-27, which began on 1 April 2026.',
  regime: 'The new tax regime has lower rates but allows no HRA exemption and most other deductions. The old regime lets you claim HRA, 80C and more. This check compares the tax on your salary under both, so you can see which one leaves you better off.',
  otherPay: 'Everything else you earn from salary in a year that is not in the three amounts above: special allowance, bonus, and so on. Leave it at 0 if you have none.',
  deductions: 'Deductions you can claim in the old regime other than HRA, such as 80C (PF, ELSS, life insurance), 80D (health insurance) and home-loan interest. Enter the yearly total.',
} as const;

const fmt = (n: number) => Math.round(n).toLocaleString('en-IN');

const LIMIT_TEXT: Record<HraLimit, string> = {
  received: 'The HRA you get is what limits you: your rent and your city would allow more.',
  rent: 'Your rent is what limits you: the part of it above 10% of your salary is less than your HRA.',
  cap: 'Your city cap is what limits you: it is a fixed share of your salary, whatever rent you pay.',
};

const BAR_ROWS: { key: HraLimit; label: (p: number) => string }[] = [
  { key: 'received', label: () => 'HRA you get' },
  { key: 'rent', label: () => 'Rent minus 10% of salary' },
  { key: 'cap', label: (p) => `${p}% of salary (your city)` },
];

export function HraCalculator() {
  const [period, setPeriod] = useState<Period>('monthly');
  const [basic, setBasic] = useState('50,000');
  const [da, setDa] = useState('0');
  const [received, setReceived] = useState('20,000');
  const [rent, setRent] = useState('22,000');
  const [city, setCity] = useState<HraCity>('Delhi');
  const [year, setYear] = useState<HraYear>('2026-27');
  const [otherPay, setOtherPay] = useState('0');
  const [deductions, setDeductions] = useState('0');

  const mult = period === 'monthly' ? 12 : 1;
  const per = period === 'monthly' ? 'a month' : 'a year';

  function switchPeriod(next: Period) {
    if (next === period) return;
    const f = next === 'yearly' ? 12 : 1 / 12;
    const conv = (v: string) => {
      const n = parseAmount(v);
      return Number.isFinite(n) ? fmt(n * f) : v;
    };
    setBasic(conv(basic));
    setDa(conv(da));
    setReceived(conv(received));
    setRent(conv(rent));
    setPeriod(next);
  }

  const filled = basic.trim() !== '' && received.trim() !== '' && rent.trim() !== '';
  const input = {
    basic: parseAmount(basic),
    da: da.trim() === '' ? 0 : parseAmount(da),
    hraReceived: parseAmount(received),
    rent: parseAmount(rent),
    city,
    year,
  };
  const r = filled ? hra(input) : null;
  const pct = cityPercent(city, year);
  const max = r ? Math.max(r.limits.received, r.limits.rentOver, r.limits.cap, 1) : 1;
  const nudge = r ? rentForMaxExemption(input) : null;

  const exemptYear = r ? r.exempt * mult : 0;
  const grossYear = r ? (r.salary + r.limits.received) * mult + (otherPay.trim() === '' ? 0 : parseAmount(otherPay)) : 0;
  const check = r && year === '2026-27' ? regimeCheck({ grossYearly: grossYear, hraExemptYearly: exemptYear, otherDeductionsYearly: deductions.trim() === '' ? 0 : parseAmount(deductions) }) : null;

  const cityLabel = city === 'Other' ? 'any other place' : city;
  const summary = r
    ? `Tax-free HRA ${formatRupees(r.exempt)} ${per} (${formatRupees(r.exempt * (period === 'monthly' ? 12 : 1 / 12))} ${period === 'monthly' ? 'a year' : 'a month'}), old regime, FY ${year}, ${cityLabel} (${pct}% of salary). Taxable HRA ${formatRupees(r.taxable)} ${per}. An estimate, not tax advice.`
    : undefined;
  const slider = (monthly: [number, number, number], yearly: [number, number, number]) => (period === 'monthly' ? monthly : yearly);
  const [bMin, bMax, bStep] = slider([10000, 500000, 1000], [120000, 6000000, 12000]);
  const [dMin, dMax, dStep] = slider([0, 100000, 500], [0, 1200000, 6000]);
  const [hMin, hMax, hStep] = slider([0, 250000, 500], [0, 3000000, 6000]);
  const [rMin, rMax, rStep] = slider([0, 300000, 500], [0, 3600000, 6000]);
  const periodLabel = period === 'monthly' ? 'monthly' : 'yearly';
  const lo = (n: number) => `₹${fmt(n)}`;

  return (
    <Frame
      stickyLabel={`Tax-free HRA ${per}`}
      stickyValue={r ? shortRupees(r.exempt) : null}
      inputs={
        <>
          <Segmented
            legend="Amounts are"
            hideLegend
            options={[
              { value: 'monthly' as const, label: 'Monthly' },
              { value: 'yearly' as const, label: 'Yearly' },
            ]}
            value={period}
            onChange={switchPeriod}
          />
          <SliderField id="hra-basic" label={`Basic salary (${periodLabel})`} value={basic} onChange={setBasic} min={bMin} max={bMax} step={bStep} prefix="₹" minLabel={lo(bMin)} maxLabel={lo(bMax)} group info={HELP.basic} />
          <SliderField id="hra-da" label={`DA in your pay (${periodLabel})`} value={da} onChange={setDa} min={dMin} max={dMax} step={dStep} prefix="₹" minLabel="₹0" maxLabel={lo(dMax)} group info={HELP.da} />
          <SliderField id="hra-received" label={`HRA you receive (${periodLabel})`} value={received} onChange={setReceived} min={hMin} max={hMax} step={hStep} prefix="₹" minLabel="₹0" maxLabel={lo(hMax)} group info={HELP.hra} />
          <SliderField id="hra-rent" label={`Rent you pay (${periodLabel})`} value={rent} onChange={setRent} min={rMin} max={rMax} step={rStep} prefix="₹" minLabel="₹0" maxLabel={lo(rMax)} group info={HELP.rent} />
          <div className="space-y-2">
            <InfoHeading info={HELP.city}>City you live in</InfoHeading>
            <Chips
              legend="City you live in"
              hideLegend
              options={[...HRA_CITIES.map((c) => ({ value: c as HraCity, label: c })), { value: 'Other' as HraCity, label: 'Anywhere else' }]}
              value={city}
              onChange={setCity}
            />
          </div>
          <div className="space-y-2">
            <InfoHeading info={HELP.year}>Financial year</InfoHeading>
            <Segmented
              legend="Financial year"
              hideLegend
              options={[
                { value: '2026-27' as HraYear, label: 'FY 2026-27' },
                { value: '2025-26' as HraYear, label: 'FY 2025-26' },
              ]}
              value={year}
              onChange={setYear}
            />
          </div>
          {filled && !r && <Problem>Check the numbers: amounts must be zero or more, up to ₹100 crore, and basic salary more than zero.</Problem>}
        </>
      }
      results={
        <>
          <Answer label={`Tax-free HRA ${per} (old regime)`} value={r ? formatRupees(r.exempt) : null} copy={summary} />
          {r && (
            <>
              <dl>
                <Row label={period === 'monthly' ? 'Tax-free HRA a year' : 'Tax-free HRA a month'} value={formatRupees(r.exempt * (period === 'monthly' ? 12 : 1 / 12))} />
                <Row label={`Taxable HRA ${per}`} value={formatRupees(r.taxable)} />
                <Row label="Salary counted (basic + DA)" value={formatRupees(r.salary)} />
              </dl>

              <section aria-labelledby="hra-limits" data-testid="hra-limits">
                <h3 id="hra-limits" className="text-sm font-bold text-ink">
                  Your three limits (the smallest one wins)
                </h3>
                <ul className="mt-2 space-y-3">
                  {BAR_ROWS.map(({ key, label }) => {
                    const value = key === 'received' ? r.limits.received : key === 'rent' ? r.limits.rentOver : r.limits.cap;
                    const win = r.binding.includes(key);
                    return (
                      <li key={key} data-testid={`limit-${key}`} data-limiting={win ? 'true' : 'false'}>
                        <div className="flex items-baseline justify-between gap-3 text-sm">
                          <span className="min-w-0 text-strong">{label(r.percent)}</span>
                          <span className="shrink-0 font-semibold text-ink">
                            {formatRupees(value)}
                            {win && <span className="ml-2 rounded-full bg-activebg px-2 py-0.5 text-[11px] font-bold text-activetext">limiting</span>}
                          </span>
                        </div>
                        <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-wash" aria-hidden="true">
                          <div className={`h-full rounded-full ${win ? 'bg-coral-500' : 'bg-teal-500'}`} style={{ width: `${Math.max(2, (value / max) * 100)}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-3 text-sm text-strong" data-testid="hra-reason">
                  {input.rent === 0 ? 'No rent paid, no exemption. HRA is exempt only when you really pay rent.' : r.binding.length > 1 ? 'More than one limit is equal, so each one is holding you at this amount.' : LIMIT_TEXT[r.binding[0]]}
                </p>
              </section>

              {nudge && (
                <p className="rounded-xl bg-wash px-3 py-2 text-sm text-strong" data-testid="rent-max">
                  With rent of {formatRupees(nudge.rent)} {per}, your full HRA of {formatRupees(nudge.exempt)} would be exempt, {formatRupees(nudge.extra)} more {per}. This is only to show how the rule works: claim the rent you really pay.
                </p>
              )}

              <details className="rounded-xl border border-hair px-3 py-2" data-testid="regime-compare">
                <summary className="min-h-10 pointer-coarse:min-h-11 cursor-pointer py-1.5 text-sm font-semibold text-ink">Compare with the new regime</summary>
                <div className="space-y-4 pb-2 pt-3">
                  {year === '2025-26' ? (
                    <Note>This comparison uses the FY 2026-27 rules, so switch the financial year to FY 2026-27 to use it.</Note>
                  ) : (
                    <>
                      <p className="text-xs text-muted">{HELP.regime}</p>
                      <SliderField id="hra-other-pay" label="Other salary in a year" value={otherPay} onChange={setOtherPay} min={0} max={5000000} step={50000} prefix="₹" minLabel="₹0" maxLabel="₹50,00,000" group info={HELP.otherPay} />
                      <SliderField id="hra-deductions" label="Other old-regime deductions in a year" value={deductions} onChange={setDeductions} min={0} max={500000} step={10000} prefix="₹" minLabel="₹0" maxLabel="₹5,00,000" group info={HELP.deductions} />
                      {check ? (
                        <>
                          <dl data-testid="regime-result">
                            <Row label="Salary for the year" value={formatRupees(grossYear)} />
                            <Row label="Old regime tax (with your HRA)" value={formatRupees(check.old.tax)} />
                            <Row label="New regime tax" value={formatRupees(check.new.tax)} />
                          </dl>
                          <p className="text-sm font-semibold text-ink" data-testid="regime-verdict">
                            {check.better === 'same' ? 'Both regimes cost the same for you.' : `The ${check.better} regime leaves you ${formatRupees(check.saving)} more a year.`}
                          </p>
                          <Note>
                            Salary income only, FY 2026-27 slabs, standard deduction, rebate, surcharge and 4% cess. Professional tax, other income and capital gains are not included. The Salary Calculator uses the same rules.
                          </Note>
                        </>
                      ) : (
                        <Note>Fill in the HRA amounts above to compare.</Note>
                      )}
                    </>
                  )}
                </div>
              </details>

              <PrintAction />
            </>
          )}
          <Note>
            The new tax regime allows no HRA exemption: your full HRA is taxable there. Worked out from rule 279 of the Income-tax Rules 2026 (FY 2026-27) and the earlier four-city rule (FY 2025-26). Bonus, other allowances, commission, part-year stays and rent paid to a relative are not covered. An estimate, not tax advice; your employer&apos;s payroll may apply the rules a little differently. Rules checked {HRA_RULES_CHECKED}.
          </Note>
          <p className="hidden print:block" data-testid="print-summary">
            {summary} kaamsolv.com/hra-calculator
          </p>
        </>
      }
    />
  );
}
