'use client';

import { Segmented } from '../choice';

/** 7 / 30 / 90 days. The 90-day view needs `qr_breakdowns`, so it is only offered when allowed. */
export function RangePicker({ value, onChange, allow90 }: { value: 7 | 30 | 90; onChange: (v: 7 | 30 | 90) => void; allow90: boolean }) {
  const options: { value: 7 | 30 | 90; label: string }[] = [
    { value: 7, label: '7 days' },
    { value: 30, label: '30 days' },
    ...(allow90 ? [{ value: 90 as const, label: '90 days' }] : []),
  ];
  return <Segmented<7 | 30 | 90> legend="Time range" hideLegend options={options} value={value} onChange={onChange} />;
}
