import type { Cell, Week } from '@/app/lib/notice/calc';

/** Diagonal stripes for a weekend day inside the notice: a pattern, not just a colour, so it reads without colour vision. */
const STRIPES = 'repeating-linear-gradient(135deg, color-mix(in srgb, currentColor 30%, transparent) 0 3px, transparent 3px 6px)';

function cellClass(c: Cell): string {
  const base = 'relative grid h-8 min-w-0 place-items-center rounded-md text-[11px] leading-none min-[360px]:h-9 min-[360px]:text-xs sm:h-10 sm:rounded-lg sm:text-sm';
  if (c.last) return `${base} bg-coral-500 font-bold text-navy-900`;
  if (c.resign) return `${base} font-bold text-ink ring-2 ring-inset ring-ink ${c.inNotice ? (c.off ? 'text-muted' : 'bg-teal-500/25') : ''}`;
  if (c.inNotice) return `${base} ${c.off ? 'text-muted' : 'bg-teal-500/25 text-ink'}`;
  return `${base} text-faint`;
}

/**
 * The notice as a calendar strip: weeks Monday to Sunday, the day you resign ringed, the notice days tinted, weekend days striped,
 * the last working day solid coral. The picture is for looking at; the Table view next to it and the label on this block carry the
 * same facts in words. Shapes differ as well as colours, and the legend names each one.
 */
export function NoticeStrip({ weeks, label }: { weeks: Week[]; label: string }) {
  return (
    <div>
      <div role="img" aria-label={label} data-testid="notice-strip" className="grid grid-cols-[2rem_repeat(7,minmax(0,1fr))] gap-[3px] sm:gap-1">
        <span aria-hidden="true" />
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <span key={i} aria-hidden="true" className="pb-1 text-center text-[11px] font-semibold text-muted">
            {d}
          </span>
        ))}
        {weeks.map((w, wi) =>
          w.kind === 'gap' ? (
            <span key={`g${wi}`} aria-hidden="true" data-testid="notice-gap" className="col-span-8 py-1.5 text-center text-xs text-muted">
              {w.weeks} more {w.weeks === 1 ? 'week' : 'weeks'}
            </span>
          ) : (
            <WeekRow key={wi} week={w} />
          ),
        )}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-strong" aria-label="What the shapes mean">
        <Legend swatch={<span className="inline-block h-3.5 w-3.5 rounded ring-2 ring-inset ring-ink" />}>You resign</Legend>
        <Legend swatch={<span className="inline-block h-3.5 w-3.5 rounded bg-teal-500/40" />}>Notice days</Legend>
        <Legend swatch={<span className="inline-block h-3.5 w-3.5 rounded text-muted" style={{ backgroundImage: STRIPES }} />}>Weekend</Legend>
        <Legend swatch={<span className="inline-block h-3.5 w-3.5 rounded bg-coral-500" />}>Last working day</Legend>
      </ul>
    </div>
  );
}

function Legend({ swatch, children }: { swatch: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-1.5">
      <span aria-hidden="true">{swatch}</span>
      {children}
    </li>
  );
}

function WeekRow({ week }: { week: Extract<Week, { kind: 'week' }> }) {
  return (
    <>
      <span aria-hidden="true" className="self-center text-[11px] font-semibold text-muted">
        {week.label}
      </span>
      {week.cells.map((c) => (
        <span
          key={c.day}
          aria-hidden="true"
          data-day={c.day}
          data-in-notice={c.inNotice ? '1' : undefined}
          data-off={c.inNotice && c.off ? '1' : undefined}
          data-resign={c.resign ? '1' : undefined}
          data-last={c.last ? '1' : undefined}
          data-today={c.today ? '1' : undefined}
          className={cellClass(c)}
          style={c.inNotice && c.off && !c.last && !c.resign ? { backgroundImage: STRIPES } : undefined}
        >
          {c.num}
          {c.today && <span className="absolute bottom-[3px] h-[3px] w-[3px] rounded-full bg-current" />}
        </span>
      ))}
    </>
  );
}
