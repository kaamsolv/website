'use client';

import { useState } from 'react';
import { Answer, CARD, NumberField } from './everyday-calculators';
import { Segmented } from '../choice';
import { formatNumber, parseAmount } from '@/app/lib/calc/everyday';
import { salary, SALARY_RULES, SALARY_RULES_CHECKED, type Regime } from '@/app/lib/calc/salary';

const rupees = (n: number) => `₹${formatNumber(Math.round(n))}`;
const HINT = 'mt-1 text-xs text-muted';
const CEILING = rupees(SALARY_RULES.pf.wageCeilingMonthly);

export function SalaryCalculator() {
  const [ctc, setCtc] = useState('');
  const [variable, setVariable] = useState('');
  const [regime, setRegime] = useState<Regime>('new');
  const [deductions, setDeductions] = useState('');
  const [more, setMore] = useState(false);
  const [basicPercent, setBasicPercent] = useState('50');
  const [pfCapped, setPfCapped] = useState(true);
  const [employerPfInCtc, setEmployerPfInCtc] = useState(true);
  const [gratuityInCtc, setGratuityInCtc] = useState(true);
  const [pt, setPt] = useState('200');

  const optional = (s: string) => (s.trim() === '' ? 0 : parseAmount(s));
  const r = ctc.trim()
    ? salary({
        ctc: parseAmount(ctc),
        variable: optional(variable),
        basicPercent: optional(basicPercent),
        pfCapped,
        employerPfInCtc,
        gratuityInCtc,
        professionalTaxMonthly: optional(pt),
        oldRegimeDeductions: optional(deductions),
      })
    : null;
  const mine = r?.[regime];
  const diff = r ? r.new.yearlyInHand - r.old.yearlyInHand : 0;
  const copy =
    r && mine
      ? `In-hand ${rupees(mine.monthlyInHand)} a month (${rupees(mine.yearlyInHand)} a year), ${regime} tax regime, CTC ${rupees(r.ctc)}. Estimate by KaamSolv.`
      : undefined;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className={`space-y-5 ${CARD}`}>
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField id="sal-ctc" label="Your CTC (a year)" value={ctc} onChange={setCtc} prefix="₹" placeholder="12,00,000" />
          <div>
            <NumberField id="sal-variable" label="Bonus / variable in it (a year)" value={variable} onChange={setVariable} prefix="₹" placeholder="0" />
            <p className={HINT}>Leave empty if your CTC is all fixed pay.</p>
          </div>
        </div>

        <Segmented
          legend="Tax regime"
          options={[
            { value: 'new' as Regime, label: 'New regime' },
            { value: 'old' as Regime, label: 'Old regime (under 60)' },
          ]}
          value={regime}
          onChange={setRegime}
        />

        {regime === 'old' && (
          <div>
            <NumberField id="sal-deductions" label="Deductions you claim (a year)" value={deductions} onChange={setDeductions} prefix="₹" placeholder="1,50,000" />
            <p className={HINT}>80C (your PF counts towards it), 80D, HRA exemption, home-loan interest — added up.</p>
          </div>
        )}

        {ctc.trim() && !r && (
          <p className="text-sm font-medium text-danger-700" role="alert">
            Check the numbers: CTC up to ₹10 crore, bonus less than the CTC, Basic 30–70%, professional tax up to ₹300 a
            month.
          </p>
        )}

        <Answer label="In-hand a month" value={mine ? rupees(mine.monthlyInHand) : null} copy={copy} />

        {r && mine && (
          <div className="space-y-1 text-sm text-strong">
            <p>
              <span className="font-semibold text-ink">{rupees(mine.yearlyInHand)}</span> a year in your account
              {r.variable > 0 && (
                <>
                  , including <span className="font-semibold text-ink">{rupees(mine.variableInHand)}</span> of bonus after
                  its tax
                </>
              )}
              .
            </p>
            <p>
              {diff === 0
                ? 'Both regimes come out the same for you.'
                : `${diff > 0 ? 'New' : 'Old'} regime leaves you ${rupees(Math.abs(diff))} more a year.`}
            </p>
          </div>
        )}

        <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-strong">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-hair text-coral-500 focus-visible:ring-2 focus-visible:ring-coral-500"
            checked={more}
            onChange={(e) => setMore(e.target.checked)}
          />
          More options
        </label>

        {more && (
          <div className="space-y-4 rounded-xl border border-hair bg-surface p-4" role="region" aria-label="Salary options">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <NumberField id="sal-basic" label="Basic (% of fixed pay)" value={basicPercent} onChange={setBasicPercent} suffix="%" placeholder="50" />
                <p className={HINT}>Check your offer letter. 30–70%.</p>
              </div>
              <div>
                <NumberField id="sal-pt" label="Professional tax (a month)" value={pt} onChange={setPt} prefix="₹" placeholder="200" />
                <p className={HINT}>Depends on your state. ₹0 where there is none.</p>
              </div>
            </div>
            <Segmented
              legend="PF is worked out on"
              options={[
                { value: true, label: `Basic up to ${CEILING}` },
                { value: false, label: 'Full basic' },
              ]}
              value={pfCapped}
              onChange={setPfCapped}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Segmented
                legend="Employer PF is in the CTC"
                options={[
                  { value: true, label: 'Yes' },
                  { value: false, label: 'No' },
                ]}
                value={employerPfInCtc}
                onChange={setEmployerPfInCtc}
              />
              <Segmented
                legend="Gratuity is in the CTC"
                options={[
                  { value: true, label: 'Yes' },
                  { value: false, label: 'No' },
                ]}
                value={gratuityInCtc}
                onChange={setGratuityInCtc}
              />
            </div>
          </div>
        )}
      </div>

      {r && mine && (
        <section aria-labelledby="sal-breakdown" className={CARD}>
          <h2 id="sal-breakdown" className="font-display text-lg font-bold text-ink">
            Where your CTC goes
          </h2>
          <div className="mt-4 overflow-x-auto rounded-lg border border-hair">
            <table className="w-full text-right text-sm">
              <thead className="bg-wash text-xs text-muted">
                <tr className="border-b border-hair">
                  <th scope="col" className="px-2 py-2 text-left font-semibold sm:px-3">
                    {regime === 'new' ? 'New regime' : 'Old regime'}
                  </th>
                  <th scope="col" className="px-2 py-2 font-semibold sm:px-3">A month</th>
                  <th scope="col" className="px-2 py-2 font-semibold sm:px-3">A year</th>
                </tr>
              </thead>
              <tbody className="tabular-nums text-strong">
                <Line label="Basic" year={r.basic} />
                <Line label="Allowances (HRA, special…)" year={r.allowances} />
                {r.employerPf > 0 && <Line label="Employer PF" year={r.employerPf} />}
                {r.gratuity > 0 && <Line label="Gratuity" year={r.gratuity} />}
                {r.variable > 0 && <Line label="Bonus / variable" year={r.variable} yearly />}
                <Line label="CTC" month={(r.ctc - r.variable) / 12} year={r.ctc} strong />
                {r.employerPf > 0 && <Line label="− Employer PF (goes to your PF account)" year={r.employerPf} />}
                {r.gratuity > 0 && <Line label="− Gratuity (paid when you leave)" year={r.gratuity} />}
                <Line label="− Your PF" year={r.employeePf} />
                <Line label="− Professional tax" year={r.professionalTax} />
                <Line
                  label="− Income tax (with 4% cess)"
                  month={(mine.tax.tax - mine.variableTax) / 12}
                  year={mine.tax.tax}
                />
                <Line label="In-hand" month={mine.monthlyInHand} year={mine.yearlyInHand} strong />
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted">
            Taxable income {rupees(mine.tax.taxable)} · income tax is{' '}
            {r.gross > 0 ? `${formatNumber(Math.round((mine.tax.tax / r.gross) * 1000) / 10)}%` : '0%'} of your gross
            salary of {rupees(r.gross)}.
            {r.variable > 0 && ' The month column leaves out the bonus and its tax.'}
          </p>
        </section>
      )}

      <section aria-labelledby="sal-assumptions" className={`${CARD} text-sm text-strong`}>
        <h2 id="sal-assumptions" className="font-display text-base font-bold text-ink">
          What this assumes
        </h2>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>
            FY 2026-27 rules under the Income-tax Act, 2025. Rules checked {SALARY_RULES_CHECKED}. An estimate, not tax
            advice.
          </li>
          <li>
            You&apos;re a resident, salaried and under 60. The old regime uses the under-60 slabs; senior-citizen slabs
            aren&apos;t used, so the estimate may be off if you&apos;re 60 or older.
          </li>
          <li>
            Under the labour codes, at least half your pay counts as wages for PF and gratuity, so we start Basic at
            50%. Your company&apos;s split may differ — change it under More options.
          </li>
          <li>
            PF is 12% of basic, on a wage capped at {CEILING} a month (the EPF ceiling from 17 September 2026), used
            for the whole year, not prorated. Gratuity is 4.81% of basic (15/26 of a month&apos;s basic a year).
          </li>
          <li>
            Monthly in-hand is shown excluding the tax attributable to variable pay; your payslip may deduct TDS on the
            full annual projection.
          </li>
          <li>
            Professional tax depends on your state (capped at ₹2,500 a year). ESI, NPS, meal cards and other perks
            aren&apos;t included.
          </li>
          <li>
            Other calculators may show a higher in-hand. Some don&apos;t take gratuity out of the CTC, leave PF out unless
            you add it, or tax the employer&apos;s PF as salary — we don&apos;t, because it isn&apos;t taxable. If
            gratuity isn&apos;t part of your CTC, switch it off under More options.
          </li>
        </ul>
      </section>
    </div>
  );
}

function Line({
  label,
  year,
  month,
  yearly,
  strong,
}: {
  label: string;
  year: number;
  month?: number;
  /** Paid once a year: no monthly figure. */
  yearly?: boolean;
  strong?: boolean;
}) {
  const cls = strong ? 'font-semibold text-ink' : '';
  return (
    <tr className={`border-b border-hair last:border-0 ${strong ? 'bg-wash' : ''}`}>
      <th scope="row" className={`px-2 py-2 text-left font-medium sm:px-3 ${strong ? 'text-ink' : 'text-strong'}`}>
        {label}
      </th>
      <td className={`whitespace-nowrap px-2 py-2 sm:px-3 ${cls}`}>{yearly ? '—' : rupees(month ?? year / 12)}</td>
      <td className={`whitespace-nowrap px-2 py-2 sm:px-3 ${cls}`}>{rupees(year)}</td>
    </tr>
  );
}
