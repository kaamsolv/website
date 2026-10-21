'use client';

import { useState } from 'react';
import { Answer, CARD, FIELD, NumberField, Row } from './everyday-calculators';
import { Chips, Segmented } from '../choice';
import { emi, gst, GST_PRESET_RATES, GST_RATES_CHECKED, type GstMode } from '@/app/lib/calc/finance';
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

export function EmiCalculator() {
  const [amount, setAmount] = useState('');
  const [rate, setRate] = useState('');
  const [tenure, setTenure] = useState('');
  const [unit, setUnit] = useState<'years' | 'months'>('years');
  const [monthly, setMonthly] = useState(false);

  const tenureN = parseAmount(tenure);
  const months = unit === 'years' ? Math.round(tenureN * 12) : Math.round(tenureN);
  const r = emi(parseAmount(amount), parseAmount(rate), months);
  const filled = amount && rate && tenure;
  const principalShare = r ? Math.round(((r.totalPayment - r.totalInterest) / r.totalPayment) * 100) : 0;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className={`space-y-5 ${CARD}`}>
        <div className="grid gap-4 sm:grid-cols-3">
          <NumberField id="emi-amount" label="Loan amount" value={amount} onChange={setAmount} prefix="₹" placeholder="10,00,000" />
          <NumberField id="emi-rate" label="Interest rate (yearly)" value={rate} onChange={setRate} suffix="%" placeholder="8.5" />
          <div>
            <NumberField id="emi-tenure" label="Loan tenure" value={tenure} onChange={setTenure} placeholder={unit === 'years' ? '20' : '240'} />
            <Segmented
              legend="Tenure in"
              hideLegend
              className="mt-2"
              options={[
                { value: 'years' as const, label: 'Years' },
                { value: 'months' as const, label: 'Months' },
              ]}
              value={unit}
              onChange={setUnit}
            />
          </div>
        </div>

        {filled && !r && (
          <p className="text-sm font-medium text-danger-700">
            Check the numbers: loan up to ₹100 crore, interest 0–50% a year, tenure up to 40 years.
          </p>
        )}

        <Answer label="Monthly EMI" value={r ? formatRupees(r.emi) : null} copy={r ? String(r.emi) : undefined} />

        {r && (
          <>
            <dl>
              <Row label="Principal" value={formatRupees(r.totalPayment - r.totalInterest)} />
              <Row label="Total interest" value={formatRupees(r.totalInterest)} />
              <Row label={`Total paid over ${formatNumber(r.months)} months`} value={formatRupees(r.totalPayment)} />
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
          </>
        )}
        <p className="text-xs text-muted">
          Uses the standard monthly reducing-balance method most Indian banks use. Your bank&apos;s figure may differ
          slightly with fees, insurance or a different start date.
        </p>
      </div>

      {r && (
        <section aria-labelledby="schedule-title" className={CARD}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="schedule-title" className="font-display text-lg font-bold text-ink">
              Repayment schedule
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
            <table className="w-full min-w-[30rem] text-right text-sm">
              <thead className="sticky top-0 bg-surface text-xs text-muted">
                <tr className="border-b border-hair">
                  <th scope="col" className="px-3 py-2 text-left font-semibold">{monthly ? 'Month' : 'Year'}</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Principal</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Interest</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Balance</th>
                </tr>
              </thead>
              <tbody className="tabular-nums text-strong">
                {(monthly ? r.schedule.map((x) => ({ key: x.month, ...x })) : r.byYear.map((x) => ({ key: x.year, ...x }))).map((row) => (
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
      )}
    </div>
  );
}
