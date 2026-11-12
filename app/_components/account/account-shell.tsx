import { SiteFooter } from '../site-footer';
import { SiteHeader } from '../site-header';
import { WorkspaceShell } from '../shell/workspace-shell';
import { WorkspaceNav } from './workspace-nav';

/**
 * Shell for /login and the signed-in /app pages. Kept as a thin wrapper so its many callers don't change:
 * signed-in pages (`workspace`) now sit in the full-screen WorkspaceShell; /login keeps the public frame.
 */
export function AccountShell({
  title,
  intro,
  actions,
  narrow = false,
  workspace = false,
  children,
}: {
  title: string;
  intro?: React.ReactNode;
  actions?: React.ReactNode;
  narrow?: boolean;
  /** Signed-in pages: adds the workspace navigation (sidebar / tab bar). */
  workspace?: boolean;
  children: React.ReactNode;
}) {
  if (workspace) {
    return (
      <WorkspaceShell nav={<WorkspaceNav stacked />} title={title} intro={intro} actions={actions} narrow={narrow}>
        {children}
      </WorkspaceShell>
    );
  }
  const heading = (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">{title}</h1>
        {intro && <p className="mt-2 text-muted sm:text-lg">{intro}</p>}
      </div>
      {actions}
    </div>
  );
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main" className="min-h-[70vh] bg-canvas">
        <div className={`kk-container py-10 sm:py-14 ${narrow ? 'max-w-md' : ''}`}>
          {heading}
          <div className="mt-8">{children}</div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

export { BTN, PRIMARY, SECONDARY, INPUT } from '@/app/lib/ui-classes';
