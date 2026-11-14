'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ACCENT } from '../accent';
import { Icon } from '../icons';
import { useAffiliateNav, type StatusCounts } from '@/app/lib/affiliate/use-affiliate-nav';

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500';
const ROW = `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold ${FOCUS}`;
const SUB = `flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium ${FOCUS}`;
const IDLE = 'text-strong hover:bg-wash';
const ACTIVE = 'bg-activebg text-activetext';

const BASE = '/app/affiliate';
const JOINED = `${BASE}/programmes`;
const APPLICATIONS = `${BASE}/applications`;
const PORTAL = `${BASE}/portal`;

const total = (c: StatusCounts) => c.pending + c.approved + c.rejected + c.withdrawn;

/**
 * The sidebar's Affiliate entry. Affiliate isn't a product you subscribe to: it's a role, and one account can hold
 * both, so it has its own row with its own two branches, each opening to the points that matter:
 *   Joined   (I promote other businesses): All, Applied, Approved, Not approved, each with its count;
 *   Created  (I run a programme): To review, Approved, Not approved, Portal settings, with counts.
 * Until a person has made a programme, "Created" is a plain link to set one up.
 * The counts come from one request (/api/affiliate/nav) and refresh on every page.
 */
export function AffiliateNavSection() {
  const pathname = usePathname() ?? '';
  const nav = useAffiliateNav(pathname);
  const [search, setSearch] = useState('');
  // `window.location.search` rather than useSearchParams: this sits in every signed-in page, and static pages can't read the query.
  useEffect(() => setSearch(window.location.search), [pathname]);
  const status = new URLSearchParams(search).get('status');

  const inJoined = pathname === JOINED;
  const inCreated = pathname === APPLICATIONS || pathname === PORTAL;
  const [openJoined, setOpenJoined] = useState(inJoined || pathname === BASE);
  const [openCreated, setOpenCreated] = useState(inCreated || pathname === BASE);

  const a = ACCENT.purple;
  const here = (path: string, st?: string) => pathname === path && (st ? status === st : !status);

  const sub = (href: string, label: string, count: number | undefined, active: boolean, opts: { badge?: boolean; testid?: string } = {}) => (
    <li key={href}>
      <a href={href} aria-current={active ? 'page' : undefined} data-testid={opts.testid} className={`${SUB} ${active ? ACTIVE : IDLE}`}>
        {label}
        {count !== undefined && (
          <span className={`ml-auto text-xs ${opts.badge && count > 0 ? 'rounded-full bg-yellowx-100 px-2 py-0.5 font-bold text-strong' : 'font-normal text-muted'}`}>{count}</span>
        )}
      </a>
    </li>
  );

  const group = (opts: { id: string; href: string; label: string; open: boolean; setOpen: (v: boolean) => void; current: boolean; badge?: number; children: React.ReactNode }) => (
    <li key={opts.id} data-testid={`nav-affiliate-${opts.id}`}>
      <div className="flex items-center gap-0.5">
        <a href={opts.href} aria-current={opts.current ? 'page' : undefined} className={`${ROW} min-w-0 flex-1 ${opts.current ? ACTIVE : IDLE}`}>
          <span className="leading-tight">{opts.label}</span>
          {opts.badge ? (
            <span className="ml-auto rounded-full bg-yellowx-100 px-2 py-0.5 text-xs font-bold text-strong" aria-label={`${opts.badge} to review`} data-testid="nav-affiliate-pending">
              {opts.badge}
            </span>
          ) : null}
        </a>
        <button
          type="button"
          aria-expanded={opts.open}
          aria-label={`${opts.open ? 'Hide' : 'Show'} ${opts.label} options`}
          onClick={() => opts.setOpen(!opts.open)}
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-wash ${FOCUS}`}
        >
          <Icon name="chevron-down" className={`h-4 w-4 transition-transform motion-reduce:transition-none ${opts.open ? '' : '-rotate-90'}`} />
        </button>
      </div>
      {opts.open && <ul className="ml-3 mt-0.5 flex flex-col gap-0.5 border-l border-hair pl-2">{opts.children}</ul>}
    </li>
  );

  const joined = nav?.joined;
  const created = nav?.created ?? null;

  return (
    <li data-testid="nav-affiliate">
      <a
        href={BASE}
        data-testid="nav-affiliate-root"
        aria-current={pathname === BASE ? 'page' : undefined}
        className={`${ROW} ${pathname === BASE ? ACTIVE : IDLE}`}
      >
        <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-md ${a.tint} ${a.fg}`}>
          <Icon name="affiliate" className="h-4 w-4" />
        </span>
        Affiliate
      </a>
      <ul className="ml-3 mt-0.5 flex flex-col gap-0.5">
        {group({
          id: 'joined',
          href: JOINED,
          label: 'Joined',
          open: openJoined,
          setOpen: setOpenJoined,
          current: here(JOINED),
          children: [
            sub(JOINED, 'All', joined ? total(joined) : undefined, here(JOINED), { testid: 'nav-joined-all' }),
            sub(`${JOINED}?status=pending`, 'Applied', joined?.pending, here(JOINED, 'pending'), { testid: 'nav-joined-pending' }),
            sub(`${JOINED}?status=approved`, 'Approved', joined?.approved, here(JOINED, 'approved'), { testid: 'nav-joined-approved' }),
            sub(`${JOINED}?status=rejected`, 'Not approved', joined?.rejected, here(JOINED, 'rejected'), { testid: 'nav-joined-rejected' }),
          ],
        })}

        {created === null ? (
          <li key="created-setup" data-testid="nav-affiliate-created">
            <a href={PORTAL} aria-current={pathname === PORTAL ? 'page' : undefined} className={`${ROW} ${pathname === PORTAL ? ACTIVE : IDLE}`}>
              <span className="truncate">Created</span>
            </a>
          </li>
        ) : (
          group({
            id: 'created',
            href: APPLICATIONS,
            label: 'Created',
            open: openCreated,
            setOpen: setOpenCreated,
            current: here(APPLICATIONS),
            badge: created.counts.pending,
            children: [
              sub(`${APPLICATIONS}?status=pending`, 'To review', created.counts.pending, here(APPLICATIONS, 'pending'), { badge: true, testid: 'nav-created-pending' }),
              sub(`${APPLICATIONS}?status=approved`, 'Approved', created.counts.approved, here(APPLICATIONS, 'approved'), { testid: 'nav-created-approved' }),
              sub(`${APPLICATIONS}?status=rejected`, 'Not approved', created.counts.rejected, here(APPLICATIONS, 'rejected'), { testid: 'nav-created-rejected' }),
              sub(PORTAL, 'Portal settings', undefined, here(PORTAL), { testid: 'nav-created-portal' }),
            ],
          })
        )}
      </ul>
    </li>
  );
}
