import { SAMPLE_BREAKDOWNS, SAMPLE_QR_ROWS, SAMPLE_QR_SIZE, sampleDays } from '@/app/lib/qr/sample-report';

/**
 * The QR Pro page's one visual: a static QR code, and beside it a scan report built from the same square
 * "module" the code is made of (navy squares for the code, coral squares stacked into the 90-day bars).
 * Every number in it is made up and says so (chip, caption). The picture is hidden from assistive tech;
 * the caption carries the meaning. Server-safe: no hooks, no browser APIs.
 */

const ROWS = 20; // module rows in the histogram
const QUIET = 4; // quiet zone around the QR, in modules (the QR standard)

function qrPath(): string {
  let d = '';
  SAMPLE_QR_ROWS.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) if (row[c] === '1') d += `M${c + QUIET} ${r + QUIET}h1v1h-1z`;
  });
  return d;
}

function histogramPath(days: number[]): string {
  const max = Math.max(...days);
  const inset = 0.1;
  let d = '';
  days.forEach((v, col) => {
    const n = Math.max(1, Math.ceil((v / max) * ROWS));
    for (let k = 0; k < n; k++) {
      const y = ROWS - 1 - k;
      d += `M${col + inset} ${y + inset}h${1 - 2 * inset}v${1 - 2 * inset}h-${1 - 2 * inset}z`;
    }
  });
  return d;
}

export function QrProSpecimen() {
  const days = sampleDays();
  const total = days.reduce((a, b) => a + b, 0);
  const qrUnits = SAMPLE_QR_SIZE + QUIET * 2;
  const caption = `Illustrative sample, not from your account. A static QR code beside a made-up report: about ${total.toLocaleString('en-IN')} scans over 90 days, shown per day, plus scans by country, device type and referring site. Scan the code to open the free KaamSolv QR generator.`;

  return (
    <figure className="m-0 rounded-xl2 border border-hair bg-surface p-4 sm:p-5" data-testid="qr-specimen">
      <div aria-hidden="true">
        <p className="flex flex-wrap items-center gap-2">
          <span data-testid="illustrative-chip" className="rounded-full border border-dashed border-yellow-500 bg-yellow-300 px-2.5 py-0.5 text-xs font-semibold text-navy-900">
            Illustrative sample
          </span>
          <span className="text-xs text-muted">Made-up numbers, not from your account</span>
        </p>

        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end">
          {/* The code stays a white "paper" tile in both themes so it can be scanned. */}
          <div className="qr-paper w-fit shrink-0 rounded-lg border border-hair p-0 text-navy-900">
            <svg viewBox={`0 0 ${qrUnits} ${qrUnits}`} className="block h-32 w-32 sm:h-36 sm:w-36" shapeRendering="crispEdges">
              <rect width={qrUnits} height={qrUnits} fill="#FFFFFF" />
              <path d={qrPath()} fill="#0C2248" />
            </svg>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pb-2">
              <span className="text-sm font-semibold text-ink">Scans per day</span>
              <span className="inline-flex whitespace-nowrap rounded-full border border-hair bg-wash p-0.5 text-xs font-semibold">
                <span className="rounded-full px-2.5 py-1 text-strong">7 days</span>
                <span className="rounded-full px-2.5 py-1 text-strong">30 days</span>
                <span className="rounded-full bg-activebg px-2.5 py-1 text-activetext">90 days</span>
              </span>
            </div>
            <svg viewBox={`0 0 ${days.length} ${ROWS}`} className="block h-auto w-full text-coral-500" shapeRendering="crispEdges" preserveAspectRatio="xMinYMax meet">
              <path d={histogramPath(days)} fill="currentColor" />
            </svg>
            <div className="mt-1 flex justify-between text-xs text-muted">
              <span>90 days ago</span>
              <span>today</span>
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-4 border-t border-hair pt-4 sm:grid-cols-3">
          {SAMPLE_BREAKDOWNS.map((b) => (
            <div key={b.title}>
              <p className="text-sm font-semibold text-ink">{b.title}</p>
              <ul className="mt-2 space-y-2">
                {b.items.map((i) => (
                  <li key={i.label} className="text-xs">
                    <div className="flex justify-between gap-2">
                      <span className="truncate text-ink">{i.label}</span>
                      <span className="shrink-0 tabular-nums text-muted">{i.percent}%</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-wash">
                      <div className="h-full rounded-full bg-coral-500" style={{ width: `${i.percent}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <figcaption className="mt-4 text-xs text-muted" data-testid="specimen-caption">
        {caption}
      </figcaption>
    </figure>
  );
}
