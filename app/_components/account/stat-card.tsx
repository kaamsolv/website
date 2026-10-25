/**
 * One figure on the Payments & Collections page: a plain label, the number, what it covers, and — when it
 * has invoices behind it — a link to exactly those invoices. The link text names the card, so a screen
 * reader hears "View the invoices behind Outstanding", not just "View invoices".
 */
export function StatCard({
  label,
  value,
  note,
  basis,
  href,
  linkLabel = 'View invoices',
  alert = false,
  testId,
}: {
  label: string;
  value: string;
  note?: string;
  /** What the number covers, in a few words: "In this period" / "As of today". */
  basis?: string;
  href?: string;
  linkLabel?: string;
  alert?: boolean;
  testId?: string;
}) {
  return (
    <div className="flex flex-col rounded-xl2 border border-hair bg-surface p-5">
      <p className="text-sm font-semibold text-muted">{label}</p>
      <p className={`mt-1 font-display text-3xl font-extrabold tabular-nums ${alert ? 'text-danger-600' : 'text-ink'}`} data-testid={testId}>
        {value}
      </p>
      {basis && <p className="mt-0.5 text-xs font-semibold uppercase tracking-wide text-faint">{basis}</p>}
      {note && <p className="mt-2 text-sm text-muted">{note}</p>}
      {href && (
        <a
          href={href}
          className="mt-3 inline-flex min-h-10 items-center self-start rounded-full text-sm font-semibold text-ink underline underline-offset-2 hover:text-coral-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500"
          aria-label={`${linkLabel} behind ${label}`}
        >
          {linkLabel}
        </a>
      )}
    </div>
  );
}
