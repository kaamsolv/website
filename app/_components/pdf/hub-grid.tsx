import { ACCENT } from '../accent';
import { Icon } from '../icons';
import { PdfIcon } from './pdf-icons';
import { PdfFeatureCard, PdfSoonCard, PdfToolCard, PopularCard } from './pdf-tool-card';
import { hubSections, popularTasks } from '@/app/lib/pdf/hub-data';
import { FREE_MAX_FILE_BYTES, MAX_RENDER_PAGES, sizeLimitLabel } from '@/app/lib/pdf/limits';

/**
 * The sections of the /pdf-tools page below the upload hero: popular tasks, the whole directory, and
 * a short note on privacy and limits. All server-rendered, so every link is in the HTML. What is
 * live, and what each card says, comes from the catalogue (`hub-data.ts`): nothing here can link to a
 * tool that isn't built.
 */

/** The three jobs most people come for: bigger cards, straight to the tool. */
export function PopularTasks() {
  const tools = popularTasks();
  if (tools.length === 0) return null;
  return (
    <section aria-labelledby="popular-pdf" className="kk-container pt-12 sm:pt-14">
      <h2 id="popular-pdf" className="font-display text-2xl font-bold text-ink">
        Popular PDF tasks
      </h2>
      <ul className="mt-5 grid gap-4 md:grid-cols-3">
        {tools.map((t) => (
          <li key={t.href}>
            <PopularCard tool={t} accent={t.accent} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Column spans on a 6-column grid so a short last row fills the width instead of leaving a hole:
 * two across on a tablet, three across on a desktop, and the leftover one or two cards stretch to share the row.
 */
function spanFor(i: number, total: number): string {
  const sm = total % 2 === 1 && i === total - 1 ? 'sm:col-span-6' : 'sm:col-span-3';
  const rest = total % 3;
  const last = i >= total - rest;
  const lg = rest === 0 || !last ? 'lg:col-span-2' : rest === 1 ? 'lg:col-span-6' : 'lg:col-span-3';
  return `${sm} ${lg}`;
}

/** Every tool, grouped. Each group has a heading row, then a full-width card grid (a lone tool gets one wide feature card). Planned tools come last in their group, quieter. */
export function HubDirectory() {
  const sections = hubSections();
  return (
    <section id="pdf-directory" aria-labelledby="all-pdf-tools" className="kk-container scroll-mt-20 py-12 sm:py-14">
      <div className="max-w-2xl">
        <h2 id="all-pdf-tools" className="font-display text-3xl font-extrabold tracking-tight text-ink">
          All PDF tools
        </h2>
        <p className="mt-2 text-muted">Pick the job. Each tool opens ready for your file, and everything stays on your device.</p>
      </div>
      <div className="mt-8">
        {sections.map((s) => {
          const a = ACCENT[s.accent];
          const n = s.live.length;
          const feature = n === 1 && s.soon.length === 0;
          return (
            <section key={s.id} aria-labelledby={`pdf-section-${s.id}`} className="border-t border-hair py-8 first:border-t-0 first:pt-0 sm:py-10">
              <header className="flex items-start gap-4">
                <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${a.tint} ${a.fg}`}>
                  <PdfIcon name={s.icon} className="h-6 w-6" />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <h3 id={`pdf-section-${s.id}`} className="font-display text-xl font-bold text-ink sm:text-2xl">
                      {s.title}
                    </h3>
                    {n > 0 && <span className="text-xs font-semibold text-muted">{n === 1 ? '1 tool' : `${n} tools`}</span>}
                  </div>
                  <p className="mt-0.5 text-sm text-muted sm:text-base">{s.blurb}</p>
                </div>
              </header>
              {feature ? (
                <div className="mt-5">
                  <PdfFeatureCard tool={s.live[0]} accent={s.accent} note={s.note} />
                </div>
              ) : (
                <ul className="mt-5 grid gap-4 sm:grid-cols-6 lg:gap-5">
                  {[
                    ...s.live.map((t) => ({ key: t.href, node: <PdfToolCard tool={t} accent={s.accent} /> })),
                    ...s.soon.map((t) => ({ key: t.label, node: <PdfSoonCard tool={t} /> })),
                  ].map((c, i, all) => (
                    <li key={c.key} className={spanFor(i, all.length)}>
                      {c.node}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </section>
  );
}

/** Restrained: three plain facts, no cards, no promises beyond what the tools do. */
export function HubTrust() {
  const items = [
    { icon: 'lock' as const, title: 'Nothing leaves your device', body: 'The work happens in your browser. KaamSolv never receives your PDF, your pages or your passwords.' },
    { icon: 'check' as const, title: 'Your original stays as it is', body: 'Every tool makes a new file for you to download. Close the tab and the working copy is gone.' },
    { icon: 'clock' as const, title: 'Plain limits', body: `Files up to ${sizeLimitLabel(FREE_MAX_FILE_BYTES)} each, and up to ${MAX_RENDER_PAGES} pages when pages are shown. Too big? Compress or split it first.` },
  ];
  return (
    <section aria-labelledby="pdf-trust" className="border-y border-hair bg-surface">
      <div className="kk-container py-10 sm:py-12">
        <h2 id="pdf-trust" className="sr-only">
          Privacy and limits
        </h2>
        <ul className="grid gap-6 sm:grid-cols-3">
          {items.map((i) => (
            <li key={i.title} className="flex gap-3">
              <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-tealx-100 text-tealx-600">
                <Icon name={i.icon} className="h-4.5 w-4.5" />
              </span>
              <div>
                <p className="font-display font-bold text-ink">{i.title}</p>
                <p className="mt-0.5 text-sm text-muted">{i.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
