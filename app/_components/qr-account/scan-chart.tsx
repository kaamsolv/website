'use client';

/**
 * Scans per day as plain SVG bars — no chart library. Colour is never the only
 * signal: the chart has a text summary for screen readers, a title on every
 * bar, and the numbers are printed (busiest day, total) beside it.
 */
export function ScanChart({ days }: { days: { day: string; scans: number }[] }) {
  const total = days.reduce((n, d) => n + d.scans, 0);
  const max = Math.max(1, ...days.map((d) => d.scans));
  const busiest = days.reduce((best, d) => (d.scans > best.scans ? d : best), days[0] ?? { day: '', scans: 0 });
  const W = 600;
  const H = 120;
  const gap = 2;
  const barW = days.length ? (W - gap * (days.length - 1)) / days.length : W;
  const shortDay = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });

  const summary =
    total === 0
      ? `No scans in the last ${days.length} days.`
      : `${total} scan${total === 1 ? '' : 's'} in the last ${days.length} days. Busiest day: ${shortDay(busiest.day)}, ${busiest.scans}.`;

  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H + 18}`} role="img" aria-label={summary} className="h-auto w-full text-coral-500">
        <line x1="0" y1={H} x2={W} y2={H} stroke="currentColor" strokeOpacity="0.25" />
        {days.map((d, i) => {
          const h = d.scans === 0 ? 0 : Math.max(3, (d.scans / max) * (H - 8));
          return (
            <rect key={d.day} x={i * (barW + gap)} y={H - h} width={barW} height={h} rx="1.5" fill="currentColor">
              <title>{`${shortDay(d.day)}: ${d.scans} scan${d.scans === 1 ? '' : 's'}`}</title>
            </rect>
          );
        })}
        {days.length > 0 && (
          <>
            <text x="0" y={H + 14} className="fill-current text-[11px] text-muted" fontSize="11">
              {shortDay(days[0].day)}
            </text>
            <text x={W} y={H + 14} textAnchor="end" className="fill-current text-[11px] text-muted" fontSize="11">
              {shortDay(days[days.length - 1].day)}
            </text>
          </>
        )}
      </svg>
      <figcaption className="mt-1 text-sm text-muted">{summary}</figcaption>
    </figure>
  );
}
