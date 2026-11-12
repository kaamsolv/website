import { ACCENT } from '../accent';
import { Icon } from '../icons';
import { PdfIcon } from './pdf-icons';
import { hubSections } from '@/app/lib/pdf/hub-data';

/**
 * The work-area presentation for a PDF tool page: a sidebar of every PDF tool (live ones only, straight
 * from the catalogue-checked registry) beside the workspace. The workspace itself is untouched; this only
 * gives it a frame. From `lg` the tool list is a sticky sidebar; below that it folds into one "PDF tools"
 * disclosure above the workspace so a phone isn't a mile of links before the drop zone.
 */

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500';

function ToolList({ current, label }: { current: string; label: string }) {
  const sections = hubSections();
  return (
    <nav aria-label={label}>
      <a
        href="/pdf-tools"
        aria-current={current === '/pdf-tools' ? 'page' : undefined}
        className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold ${FOCUS} ${current === '/pdf-tools' ? 'bg-activebg text-activetext' : 'text-strong hover:bg-wash'}`}
      >
        <Icon name="documents" className="h-4 w-4" />
        PDF workspace
      </a>
      {sections.map((s) => {
        if (s.live.length === 0) return null;
        const a = ACCENT[s.accent];
        return (
          <div key={s.id} className="mt-4">
            <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted">{s.title}</p>
            <ul className="space-y-0.5">
              {s.live.map((t) => {
                const active = t.href === current;
                return (
                  <li key={t.href}>
                    <a
                      href={t.href}
                      aria-current={active ? 'page' : undefined}
                      className={`flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm font-medium ${FOCUS} ${active ? 'bg-activebg text-activetext' : 'text-strong hover:bg-wash'}`}
                    >
                      <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-md ${active ? 'bg-white/15 text-activetext' : `${a.tint} ${a.fg}`}`}>
                        <PdfIcon name={t.icon} className="h-3.5 w-3.5" />
                      </span>
                      {t.label}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

export function PdfStage({ current, children }: { current: string; children: React.ReactNode }) {
  return (
    <div className="lg:grid lg:grid-cols-[14.5rem_minmax(0,1fr)] lg:items-start lg:gap-6">
      <aside className="hidden rounded-xl2 border border-hair bg-surface p-3 lg:sticky lg:top-20 lg:block">
        <ToolList current={current} label="PDF tools" />
      </aside>
      <details className="group mb-4 rounded-xl2 border border-hair bg-surface lg:hidden">
        <summary className={`flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl2 px-4 text-sm font-semibold text-ink ${FOCUS}`}>
          All PDF tools
          <Icon name="chevron-right" className="h-4 w-4 text-faint transition-transform group-open:rotate-90" />
        </summary>
        <div className="border-t border-hair p-3">
          <ToolList current={current} label="PDF tools menu" />
        </div>
      </details>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
