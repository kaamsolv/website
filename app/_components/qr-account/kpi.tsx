/** One number with a plain label and, where it matters, what it covers ("all time", "this month"). */
export function Kpi({ label, value, note, testId }: { label: string; value: string | number; note?: string; testId?: string }) {
  return (
    <div className="rounded-xl2 border border-hair bg-surface p-4">
      <p className="text-sm font-semibold text-muted">{label}</p>
      <p className="mt-1 font-display text-3xl font-extrabold tabular-nums text-ink" data-testid={testId}>
        {typeof value === 'number' ? value.toLocaleString('en-IN') : value}
      </p>
      {note && <p className="mt-0.5 text-xs text-muted">{note}</p>}
    </div>
  );
}
