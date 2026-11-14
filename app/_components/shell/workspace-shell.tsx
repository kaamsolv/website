import AdSlot from '@/app/components/AdSlot';
import { WorkspaceChrome } from './workspace-chrome';
import { RecentFromPath } from '../recent/recent-recorder';

/**
 * WorkspaceShell: the frame for a full-screen application (invoice management, QR management, and any
 * future product). It does not check who you are: pages that need a signed-in user do that themselves
 * (`getCurrentUser` + `redirect`), and a public editor can sit in the same frame without a login.
 *
 *   <WorkspaceShell nav={<WorkspaceNav stacked />} title="All invoices" actions={…}>…</WorkspaceShell>
 *
 * `nav` is whatever the application's sidebar is; it is rendered once, as a sidebar on a laptop and a
 * drawer on a phone. Content fills the main area; `narrow` caps it for a form-sized page.
 */
export function WorkspaceShell({
  nav,
  title,
  intro,
  actions,
  narrow = false,
  appName,
  children,
}: {
  nav: React.ReactNode;
  title: string;
  intro?: React.ReactNode;
  actions?: React.ReactNode;
  narrow?: boolean;
  appName?: string;
  children: React.ReactNode;
}) {
  return (
    <WorkspaceChrome
      nav={nav}
      appName={appName}
      after={
        <AdSlot
          slotId="workspace-footer"
          size="leaderboard"
          mode="house"
          enabled
          label="From KaamSolv"
          houseAd={{ title: 'More small tools', body: 'Calculators, converters and generators. Free, no sign-up.', ctaLabel: 'See all tools', href: '/tools' }}
        />
      }
    >
      <RecentFromPath />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">{title}</h1>
          {intro && <p className="mt-1.5 text-muted sm:text-base">{intro}</p>}
        </div>
        {actions}
      </div>
      <div className={`mt-6 ${narrow ? 'max-w-xl' : ''}`}>{children}</div>
    </WorkspaceChrome>
  );
}
